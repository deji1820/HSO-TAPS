import { Router } from "express";
import { requireAuth, requireKioskKey, requireRole } from "../middleware/auth.js";
import * as ctrl from "../controllers/students.controller.js";

const router = Router();

router.get("/academic-calendar", ctrl.getAcademicCalendar);
router.patch("/academic-calendar", requireAuth, requireRole("superadmin"), ctrl.updateAcademicCalendar);
router.patch("/roster/:personId/year-level-override", requireAuth, requireRole("superadmin"), ctrl.updateYearLevelOverride);

// Kiosk-facing (RFID tap / manual entry lookup)
router.get("/lookup/:studentId", requireKioskKey, ctrl.lookupForKiosk);
router.post("/register-rfid", requireKioskKey, ctrl.registerRfidForKiosk);
router.patch("/profile/:personId", requireKioskKey, ctrl.completeKioskProfile);

// Staff-facing (EMR search, master data)
router.get("/roster/:personId", requireAuth, requireRole("superadmin"), ctrl.getRosterRecord);
router.patch("/roster/:personId/rfid", requireAuth, requireRole("superadmin"), ctrl.resetRosterRfid);
router.patch("/roster/:personId/reset-profile", requireAuth, requireRole("superadmin"), ctrl.resetRosterProfile);
router.patch("/roster/:personId/archive", requireAuth, requireRole("superadmin"), ctrl.archiveRosterRecord);
router.patch("/roster/:personId/restore", requireAuth, requireRole("superadmin"), ctrl.restoreRosterRecord);
router.delete("/roster/:personId", requireAuth, requireRole("superadmin"), ctrl.deleteRosterRecord);
router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "superadmin"), ctrl.listStudents);
router.get("/:id/emr", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "superadmin"), ctrl.getFullEmr);
router.post("/bulk-upload", requireAuth, requireRole("superadmin"), ctrl.bulkUpsertStudents);

export default router;
