import mongoose from "mongoose";
import { migrateProblemIndexes } from "../models/Problem.js";
import GovernmentScheme from "../models/GovernmentScheme.js";

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  console.error("MongoDB disconnected.");
});

async function connectDatabase() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not configured.");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      family: 4,
      // Problem indexes are migrated explicitly below; automatic creation can
      // race a rename/replacement of an existing production index.
      autoIndex: false,
    });
    await migrateProblemIndexes();
    await GovernmentScheme.createIndexes();
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (error) {
    console.error("MongoDB initial connection failed:", error.message);
    throw error;
  }
}

export default connectDatabase;
