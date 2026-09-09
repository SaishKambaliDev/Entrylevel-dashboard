import mongoose from "mongoose";

const proposedSolutionSchema = new mongoose.Schema({
  approach: { type: String, trim: true },
  expectedOutcome: { type: String, trim: true },
  requiredResources: { type: String, trim: true },
  expectedTimeline: { type: String, trim: true },
}, { _id: false });

const projectSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true, unique: true, index: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, trim: true, maxlength: 5000 },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  assignedFaculty: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  assignedIndustryMentors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  proposedSolution: { type: proposedSolutionSchema, default: () => ({}) },
  finalSolution: { type: String, trim: true },
  expectedCompletionDate: { type: Date },
  actualCompletionDate: { type: Date },
  status: {
    type: String,
    enum: ["ACCEPTED", "UNDER_DEVELOPMENT", "VALIDATION", "DEPLOYED", "COMPLETED", "ON_HOLD"],
    default: "UNDER_DEVELOPMENT",
  },
}, { timestamps: true });

export default mongoose.model("Project", projectSchema);

