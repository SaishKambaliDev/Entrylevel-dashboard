import { Router } from "express";
import { getIndustries, searchIndustries } from "../controllers/industryController.js";

const router = Router();

router.get("/search", searchIndustries);
router.get("/", getIndustries);

export default router;
