import { Router } from "express";
import {
  getIndustryDomains,
  updateIndustryDomains,
  getMatchingHeis,
  getHeiDetails,
  getHeiProjects,
  createCollaborationRequest,
  getIndustryCollaborations,
  getIndustryCollaborationDetails,
  updateCollaborationSupport,
  getIndustryOverview,
  getIndustryMentors,
} from "../controllers/industryModuleController.js";
import { authenticate, requireIndustry, requireIndustryAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// All routes require authentication and Industry membership
router.use(authenticate, requireIndustry);

// Domains & Profile
router.get("/domains", getIndustryDomains);
router.put("/domains", requireIndustryAdmin, updateIndustryDomains);

// Overview / Analytics
router.get("/overview", getIndustryOverview);

// HEI Exploration & Projects
router.get("/heis", getMatchingHeis);
router.get("/heis/:id", getHeiDetails);
router.get("/heis/:id/projects", getHeiProjects);

// Collaborations
router.post("/collaborations", createCollaborationRequest);
router.get("/collaborations", getIndustryCollaborations);
router.get("/collaborations/:id", getIndustryCollaborationDetails);
router.put("/collaborations/:id/support", updateCollaborationSupport);

// Mentors / Team
router.get("/mentors", getIndustryMentors);

export default router;
