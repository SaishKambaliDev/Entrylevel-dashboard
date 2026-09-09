import { Router } from "express";
import { authenticate, requireGovernment } from "../middleware/authMiddleware.js";
import {
  getGovernmentStats,
  getJurisdictionProblems,
  getGeneralProblems,
  getJurisdictionProjects,
  getProjectDetails,
} from "../controllers/governmentController.js";

const router = Router();

// All routes require authentication + GOVERNMENT role
router.use(authenticate, requireGovernment);

router.get("/stats", getGovernmentStats);
router.get("/problems", getJurisdictionProblems);
router.get("/general-problems", getGeneralProblems);
router.get("/projects", getJurisdictionProjects);
router.get("/projects/:id", getProjectDetails);

export default router;
