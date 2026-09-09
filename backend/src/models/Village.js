import mongoose from "mongoose";

const villageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lgdCode: { type: Number, required: true, unique: true, index: true },
  blockId: { type: mongoose.Schema.Types.ObjectId, ref: "Block", required: true },
  subdivisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subdivision", required: true, index: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  state: { type: String, required: true, trim: true },
}, { timestamps: true });

// LGD codes identify villages. Names may repeat, including within a block.
villageSchema.index({ blockId: 1, name: 1 });

export default mongoose.model("Village", villageSchema);
