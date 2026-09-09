import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import connectDatabase from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import institutionRoutes from "./routes/institutionRoutes.js";
import industryRoutes from "./routes/industryRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import problemRoutes from "./routes/problemRoutes.js";
import heiRoutes from "./routes/heiRoutes.js";
import industryModuleRoutes from "./routes/industryModuleRoutes.js";
import governmentRoutes from "./routes/governmentRoutes.js";
import { PREDEFINED_DOMAINS } from "./config/domains.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
}));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    success: true,
    message: "JanSamadhan backend is running",
  });
});

// Public, read-only configuration consumed by the reporting UI. Domain values
// themselves remain defined only in config/domains.js.
app.get("/api/domains", (_request, response) => {
  response.status(200).json({ success: true, data: PREDEFINED_DOMAINS });
});

app.use("/api/institutions", institutionRoutes);
app.use("/api/industries", industryRoutes);
app.use("/api", locationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/hei", heiRoutes);
app.use("/api/industry", industryModuleRoutes);
app.use("/api/government", governmentRoutes);

app.use((error, _request, response, _next) => {
  if (error.type === "entity.too.large") return response.status(413).json({ success: false, message: "Total attachments must not exceed 100 MB." });
  console.error("API request failed:", error);
  response.status(500).json({ success: false, message: "An unexpected server error occurred." });
});

async function startServer() {
  try {
    await connectDatabase();
    app.listen(port, () => {
      console.log(`JanSamadhan backend listening on http://localhost:${port}`);
    });
  } catch (_error) {
    console.error("Backend stopped because the initial MongoDB connection could not be established.");
    process.exit(1);
  }
}

startServer();
