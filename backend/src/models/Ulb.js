import mongoose from "mongoose";

const ulbSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lgdCode: { type: Number, required: true, unique: true, index: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  state: { type: String, required: true, trim: true },
}, { timestamps: true });

ulbSchema.index({ name: 1, districtId: 1 }, { unique: true });

export default mongoose.model("Ulb", ulbSchema);
