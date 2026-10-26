import { Router } from "express";
import { requireAuth, requireKioskKey, requireRole } from "../middleware/auth.js";
import * as ctrl from "../controllers/appointment.controller.js";

const router = Router();

router.get("/availability", requireKioskKey, ctrl.getAvailability);
router.get("/schedule", requireKioskKey, ctrl.getAppointmentSchedule);
router.get("/clearance-requirements", ctrl.getClearanceRequirements);
router.post("/", requireKioskKey, ctrl.createAppointment);
router.get("/provider-options", requireAuth, requireRole("nurse", "supervisor", "staff"), ctrl.getProviderOptions);
router.get("/provider-schedules", requireAuth, requireRole("supervisor"), ctrl.listProviderSchedules);
router.put("/provider-schedules", requireAuth, requireRole("supervisor"), ctrl.saveProviderSchedule);
router.patch("/provider-schedules/:scheduleId/disable", requireAuth, requireRole("supervisor"), ctrl.disableProviderSchedule);
router.get("/:id/notifications", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.getAppointmentNotifications);
router.post("/:id/notifications/:notificationId/retry", requireAuth, requireRole("nurse", "supervisor"), ctrl.retryAppointmentEmail);
router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.listAppointments);
router.get("/:id", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.getAppointment);
router.post("/:id/check-in", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.checkInAppointment);
router.patch("/:id/provider", requireAuth, requireRole("nurse", "supervisor", "staff"), ctrl.assignAppointmentProvider);
router.patch("/:id/no-show-exemption", requireAuth, requireRole("nurse", "supervisor"), ctrl.updateAppointmentNoShowException);
router.patch("/:id/decision", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), ctrl.updateAppointmentDecision);

export default router;
