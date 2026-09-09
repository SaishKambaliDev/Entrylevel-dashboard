import mongoose from "mongoose";
import { DOMAIN_IDS } from "../config/domains.js";

const industrySchema = new mongoose.Schema({
  organizationName: { type: String, required: true, trim: true },
  organizationType: { type: String, required: true, trim: true },
  district: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  state: { type: String, required: true, trim: true },
  domains: { type: [{ type: String, enum: DOMAIN_IDS }], default: [] },
  description: { type: String, trim: true, default: "" },
  website: { type: String, trim: true, default: "" },
  contactEmail: { type: String, trim: true, default: "" },
  contactPhone: { type: String, trim: true, default: "" },
}, { timestamps: true });

industrySchema.index({ organizationName: 1, district: 1 }, { unique: true });

export default mongoose.model("Industry", industrySchema);
