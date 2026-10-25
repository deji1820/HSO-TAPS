import { Router } from "express";
import { requireAuth, requireKioskKey, requireRole } from "../middleware/auth.js";
import * as ctrl from "../controllers/appointment.controller.js";

const router = Router();

router.get("/availability", requireKioskKey, ctrl.getAvailability);
router.post("/", requireKioskKey, ctrl.createAppointment);
router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.listAppointments);
router.get("/:id", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.getAppointment);
router.post("/:id/check-in", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.checkInAppointment);
router.patch("/:id/decision", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.updateAppointmentDecision);

export default router;
