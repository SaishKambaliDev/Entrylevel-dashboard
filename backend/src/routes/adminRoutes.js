import { Router } from "express";
import { getPendingUsers, reviewPendingUser } from "../controllers/adminController.js";
import { authenticate, requireSystemAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticate, requireSystemAdmin);
router.get("/users/pending", getPendingUsers);
router.patch("/users/:userId/review", reviewPendingUser);

export default router;
