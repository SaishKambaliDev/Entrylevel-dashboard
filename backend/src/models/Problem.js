import mongoose from "mongoose";
import { DOMAIN_IDS } from "../config/domains.js";

const attachmentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
}, { _id: false });

const problemSchema = new mongoose.Schema({
  problemId: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  submissionKey: { type: String, trim: true, maxlength: 100 },
  isAnonymous: { type: Boolean, default: false },
  reporterSnapshot: {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  location: {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    displayName: { type: String, trim: true, maxlength: 200 },
    district: { type: String, trim: true, maxlength: 100 },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", default: null, index: true },
    subdivisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subdivision", default: null, index: true },
    blockId: { type: mongoose.Schema.Types.ObjectId, ref: "Block", default: null, index: true },
    villageId: { type: mongoose.Schema.Types.ObjectId, ref: "Village", default: null, index: true },
    ulbId: { type: mongoose.Schema.Types.ObjectId, ref: "Ulb", default: null, index: true },
  },
  attachments: { type: [attachmentSchema], default: [] },
  domain: { type: String, enum: DOMAIN_IDS, default: "OTHER", index: true },
  normalizedDescription: { type: String, default: "", index: true },
  keywords: { type: [String], default: [], index: true },
  status: {
    type: String,
    enum: [
      "SUBMITTED",
      "AVAILABLE",
      "UNDER_REVIEW",
      "ACCEPTED",
      "UNDER_DEVELOPMENT",
      "MILESTONE_PROGRESS",
      "VALIDATION",
      "DEPLOYED",
      "COMPLETED",
      "REJECTED",
      "ON_HOLD",
      "CANCELLED",
      "DUPLICATE",
    ],
    default: "AVAILABLE",
    index: true,
  },
  acceptedByInstitutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  acceptedAt: { type: Date },
  rejectedBy: [{
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution" },
    rejectionReason: { type: String, trim: true },
    rejectedAt: { type: Date, default: Date.now },
  }],
  classification: {
    isValidProblem: { type: Boolean },
    validityConfidence: { type: Number },
    domains: [{
      domain: { type: String },
      confidence: { type: Number },
    }],
    problemSummary: { type: String },
    keyNeed: { type: String },
  },
  ai: {
    processingStatus: { type: String, enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "NEEDS_REVIEW"], default: "PENDING", index: true },
    isCommunityProblem: { type: Boolean, default: null },
    classification: { type: String, enum: ["GENERAL_GOVERNMENT", "COLLABORATIVE", "PERSONAL", "SPAM", "NEEDS_REVIEW"], default: null, index: true },
    responsibleStakeholder: { type: String, enum: ["GOVERNMENT", "HEI", "INDUSTRY", "HEI_INDUSTRY", "GOVERNMENT_HEI", "GOVERNMENT_INDUSTRY", "GOVERNMENT_HEI_INDUSTRY"], default: null },
    responsibleGovernmentLevel: { type: String, enum: ["RURAL", "LOCAL", "BLOCK", "DISTRICT", "STATE"], default: null },
    domains: [{ domain: { type: String, enum: DOMAIN_IDS }, confidence: { type: Number, min: 0, max: 1 } }], confidence: { type: Number, min: 0, max: 1 },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", default: null, index: true }, reporterUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], reportCount: { type: Number, default: 1, min: 1 }, uniqueReporterCount: { type: Number, default: 1, min: 1 },
    solutionStatus: { type: String, enum: ["EXISTING_SOLUTION", "GOVERNMENT_SCHEME", "COLLABORATIVE_SOLUTION_NEEDED", "NONE_FOUND"], default: "NONE_FOUND" }, recommendations: [{ type: mongoose.Schema.Types.Mixed }],
    aiPriorityScore: { type: Number, min: 0, max: 100 }, dataPriorityScore: { type: Number, min: 0, max: 100 }, finalPriorityScore: { type: Number, min: 0, max: 100, index: true }, priorityBreakdown: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    processedAt: { type: Date }, error: { type: String, select: false }, model: { type: String },
  },
}, { timestamps: true });

// `keywords` is an array. It must not share a MongoDB text index, otherwise
// inserts fail with "Field ... of text index contains an array". This regular
// multikey index supports the bounded duplicate-candidate query safely.
problemSchema.index({ keywords: 1, domain: 1, "location.districtId": 1, "location.blockId": 1, "location.ulbId": 1 }, { name: "problem_duplicate_candidates" });
problemSchema.index({ reporterUserId: 1, submissionKey: 1 }, { name: "reporter_submission_key_unique", unique: true, partialFilterExpression: { submissionKey: { $type: "string" } } });

const Problem = mongoose.model("Problem", problemSchema);

export async function migrateProblemIndexes() {
  const indexes = await Problem.collection.indexes();
  const obsolete = indexes.filter((index) => index.name !== "_id_" && (index.key?.normalizedDescription === "text" || (index.weights?.normalizedDescription && Object.hasOwn(index.key || {}, "keywords"))));
  // Replace every historical version of this index (including one with the
  // target name but obsolete sparse options) before creating the canonical one.
  const idempotencyIndexes = indexes.filter((index) => index.name !== "_id_" && (index.name === "reporter_submission_key_unique" || (index.key?.reporterUserId === 1 && index.key?.submissionKey === 1)));
  const indexesToReplace = [...obsolete, ...idempotencyIndexes];
  await Promise.all([...new Map(indexesToReplace.map((index) => [index.name, index])).values()].map((index) => Problem.collection.dropIndex(index.name)));
  // Create declared indexes without dropping unrelated production indexes.
  await Problem.createIndexes();
}

export default Problem;
