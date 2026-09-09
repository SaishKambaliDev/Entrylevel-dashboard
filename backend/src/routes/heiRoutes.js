import { Router } from "express";
import {
  getHeiDomains,
  updateHeiDomains,
  getAvailableProblems,
  getProblemDetails,
  acceptProblem,
  rejectProblem,
  getProjects,
  getProjectDetails,
  updateProject,
  getProjectMilestones,
  createMilestone,
  updateMilestone,
  getHeiAnalytics,
  getCollaborationRequests,
  approveCollaborationRequest,
  rejectCollaborationRequest,
} from "../controllers/heiController.js";
import { authenticate, requireHei, requireHeiAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// All HEI routes require authentication and HEI role membership
router.use(authenticate, requireHei);

// Domain Configuration
router.get("/domains", getHeiDomains);
router.put("/domains", requireHeiAdmin, updateHeiDomains);

// Problem Discovery & Synchronization
router.get("/problems", getAvailableProblems);
router.get("/problems/:id", getProblemDetails);
router.post("/problems/:id/accept", acceptProblem);
router.post("/problems/:id/reject", rejectProblem);

// Project Management
router.get("/projects", getProjects);
router.get("/projects/:id", getProjectDetails);
router.put("/projects/:id", updateProject);

// Milestones
router.get("/projects/:id/milestones", getProjectMilestones);
router.post("/projects/:id/milestones", createMilestone);
router.put("/milestones/:id", updateMilestone);

// Industry Collaboration Requests
router.get("/collaboration-requests", getCollaborationRequests);
router.post("/collaboration-requests/:id/approve", approveCollaborationRequest);
router.post("/collaboration-requests/:id/reject", rejectCollaborationRequest);

// Analytics / Overview
router.get("/analytics", getHeiAnalytics);

export default router;

