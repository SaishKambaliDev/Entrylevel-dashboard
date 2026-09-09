import mongoose from "mongoose";

const supportCommitmentsSchema = new mongoose.Schema({
  funding: {
    amount: { type: Number, default: 0 },
    description: { type: String, trim: true, default: "" },
  },
  prototype: { type: String, trim: true, default: "" },
  technical: { type: String, trim: true, default: "" },
  research: { type: String, trim: true, default: "" },
  testing: { type: String, trim: true, default: "" },
  mentorship: {
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true, default: "" },
  },
  implementation: { type: String, trim: true, default: "" },
  other: { type: String, trim: true, default: "" },
}, { _id: false });

const industryCollaborationSchema = new mongoose.Schema({
  industryId: { type: mongoose.Schema.Types.ObjectId, ref: "Industry", required: true, index: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, trim: true, maxlength: 2000, default: "" },
  capabilitiesOffered: { type: [String], default: [] },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "ACTIVE", "COMPLETED", "CANCELLED"],
    default: "PENDING",
    index: true,
  },
  supportCommitments: { type: supportCommitmentsSchema, default: () => ({}) },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectedAt: { type: Date },
  rejectionReason: { type: String, trim: true, default: "" },
}, { timestamps: true });

industryCollaborationSchema.index({ industryId: 1, projectId: 1 });

export default mongoose.model("IndustryCollaboration", industryCollaborationSchema);
