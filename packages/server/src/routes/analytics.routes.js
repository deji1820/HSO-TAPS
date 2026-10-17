import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSummary } from "../controllers/analytics.controller.js";

const router = Router();

router.get("/summary", requireAuth, requireRole("supervisor"), getSummary);

export default router;
