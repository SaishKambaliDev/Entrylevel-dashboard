import mongoose from "mongoose";

const blockSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lgdCode: { type: Number, required: true, unique: true, index: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  subdivisionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subdivision", required: true }],
  state: { type: String, required: true, trim: true },
}, { timestamps: true });

blockSchema.index({ name: 1, districtId: 1 }, { unique: true });

export default mongoose.model("Block", blockSchema);
