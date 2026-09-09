import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  phone: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    required: true,
    enum: ["CITIZEN", "HEI_ADMIN", "FACULTY", "STUDENT", "INDUSTRY_ADMIN", "INDUSTRY_MENTOR", "GOVERNMENT", "SYSTEM_ADMIN"],
  },
  status: {
    type: String,
    enum: ["REGISTERED", "PENDING_VERIFICATION", "APPROVED", "REJECTED", "ACTIVE"],
    default: "REGISTERED",
  },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution" },
  institutionName: { type: String, trim: true },
  aisheCode: { type: String, trim: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Industry" },
  organizationName: { type: String, trim: true },
  organizationType: { type: String, trim: true },
  governmentLevel: { type: String, trim: true },
  state: { type: String, trim: true },
  department: { type: String, trim: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  districtName: { type: String, trim: true },
  blockId: { type: mongoose.Schema.Types.ObjectId, ref: "Block" },
  villageId: { type: mongoose.Schema.Types.ObjectId, ref: "Village" },
  ulbId: { type: mongoose.Schema.Types.ObjectId, ref: "Ulb" },
  language: { type: String, enum: ["en", "hi", "sat"], default: "en" },
}, { timestamps: true });

export default mongoose.model("User", userSchema);
