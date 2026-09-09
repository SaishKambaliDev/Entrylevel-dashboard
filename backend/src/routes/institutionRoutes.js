import { Router } from "express";
import { getInstitutions, searchInstitutions } from "../controllers/institutionController.js";

const router = Router();

router.get("/search", searchInstitutions);
router.get("/", getInstitutions);

export default router;
