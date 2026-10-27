import { Router } from "express";
import { requireKioskKey } from "../middleware/auth.js";
import * as ctrl from "../controllers/kiosk.controller.js";

const router = Router();

// Core kiosk workflow: submit a vitals reading, and/or push into the live queue
router.post("/intake", requireKioskKey, ctrl.submitIntake);
router.get("/documents/health-declaration/:studentId", requireKioskKey, ctrl.getHealthDeclarationStatus);
router.get("/clearance-submissions/:token", requireKioskKey, ctrl.getClearanceDocumentSubmission);
router.post("/clearance-submissions/:token/documents", requireKioskKey, (req, _res, next) => { req.body.clearanceSubmissionToken = req.params.token; next(); }, ctrl.submitDocument);
router.post("/documents", requireKioskKey, ctrl.submitDocument);

export default router;
