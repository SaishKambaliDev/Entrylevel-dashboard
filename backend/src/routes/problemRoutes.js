import express, { Router } from "express";
import { createProblem, getMyProblems, getMyProblemDetails, retryAiProcessing } from "../controllers/problemController.js";
import { authenticate, requireCitizenOrGovernment } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/my", authenticate, requireCitizenOrGovernment, getMyProblems);
router.get("/my/:id", authenticate, requireCitizenOrGovernment, getMyProblemDetails);
router.post("/:id/retry-ai", authenticate, requireCitizenOrGovernment, retryAiProcessing);
router.post("/", authenticate, requireCitizenOrGovernment, express.raw({ type: "multipart/form-data", limit: "105mb" }), createProblem);

export default router;
