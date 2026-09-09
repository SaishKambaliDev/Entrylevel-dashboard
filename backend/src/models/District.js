import mongoose from "mongoose";

const districtSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  lgdCode: { type: Number, required: true, unique: true, index: true },
  state: { type: String, required: true, trim: true },
}, { timestamps: true });

export default mongoose.model("District", districtSchema);
