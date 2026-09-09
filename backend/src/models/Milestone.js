import mongoose from "mongoose";

const geotaggedPhotoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  capturedAt: { type: Date, default: Date.now },
}, { _id: false });

const milestoneSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000 },
  expectedCompletionDate: { type: Date },
  status: {
    type: String,
    enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"],
    default: "NOT_STARTED",
  },
  completionPercentage: { type: Number, min: 0, max: 100, default: 0 },
  updateDate: { type: Date, default: Date.now },
  report: { type: String, trim: true, maxlength: 5000 },
  documents: { type: [String], default: [] },
  geotaggedPhotos: { type: [geotaggedPhotoSchema], default: [] },
  remarks: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true });

export default mongoose.model("Milestone", milestoneSchema);

