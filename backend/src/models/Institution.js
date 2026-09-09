import mongoose from "mongoose";
import { DOMAIN_IDS } from "../config/domains.js";

const institutionSchema = new mongoose.Schema({
  institutionName: { type: String, required: true, trim: true },
  // DEMO identifier only. It is not an official AISHE code.
  aisheCode: { type: String, required: true, trim: true, unique: true },
  institutionType: { type: String, required: true, trim: true },
  district: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  state: { type: String, required: true, trim: true },
  domains: { type: [{ type: String, enum: DOMAIN_IDS }], default: [] },
}, { timestamps: true });

institutionSchema.index({ institutionName: 1, district: 1 });

export default mongoose.model("Institution", institutionSchema);
