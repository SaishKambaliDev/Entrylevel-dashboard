import mongoose from "mongoose";
import { DOMAIN_IDS } from "../config/domains.js";

// Only verified, database-managed scheme records may be offered to Gemini.
const governmentSchemeSchema = new mongoose.Schema({
  schemeCode: { type: String, required: true, trim: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  officialUrl: { type: String, trim: true, default: "" },
  domains: { type: [{ type: String, enum: DOMAIN_IDS }], default: [], index: true },
  governmentLevel: { type: String, enum: ["RURAL", "LOCAL", "BLOCK", "DISTRICT", "STATE"], default: "STATE" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", default: null, index: true },
  blockId: { type: mongoose.Schema.Types.ObjectId, ref: "Block", default: null, index: true },
  villageId: { type: mongoose.Schema.Types.ObjectId, ref: "Village", default: null, index: true },
  ulbId: { type: mongoose.Schema.Types.ObjectId, ref: "Ulb", default: null, index: true },
  verified: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
}, { timestamps: true });

governmentSchemeSchema.index({ verified: 1, status: 1, domains: 1 });
export default mongoose.model("GovernmentScheme", governmentSchemeSchema);
