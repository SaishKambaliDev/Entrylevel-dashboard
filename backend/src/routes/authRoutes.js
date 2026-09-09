import { Router } from "express";
import { login, register, updatePreferences } from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.put("/preferences", authenticate, updatePreferences);

export default router;
