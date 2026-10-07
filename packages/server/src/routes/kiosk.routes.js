import { Router } from "express";
import { requireKioskKey } from "../middleware/auth.js";
import * as ctrl from "../controllers/kiosk.controller.js";

const router = Router();

// Core kiosk workflow: submit a vitals reading, and/or push into the live queue
router.post("/intake", requireKioskKey, ctrl.submitIntake);
router.post("/documents", requireKioskKey, ctrl.submitDocument);

export default router;
