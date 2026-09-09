import { Router } from "express";
import {
  getBlocks,
  getDistricts,
  getSubdivisions,
  getUlbs,
  getVillages,
  resolveLocation,
} from "../controllers/locationController.js";

const router = Router();
router.get("/districts", getDistricts);
router.get("/subdivisions", getSubdivisions);
router.get("/blocks", getBlocks);
router.get("/villages", getVillages);
router.get("/ulbs", getUlbs);
router.post("/location/resolve", resolveLocation);

export default router;
