import mongoose from "mongoose";

const subdivisionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lgdCode: { type: Number, required: true, unique: true, index: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  state: { type: String, required: true, trim: true },
}, { timestamps: true });

subdivisionSchema.index({ name: 1, districtId: 1 }, { unique: true });

export default mongoose.model("Subdivision", subdivisionSchema);
