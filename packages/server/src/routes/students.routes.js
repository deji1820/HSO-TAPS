import { Router } from "express";
import { requireAuth, requireKioskKey, requireRole } from "../middleware/auth.js";
import * as ctrl from "../controllers/students.controller.js";

const router = Router();

// Kiosk-facing (RFID tap / manual entry lookup)
router.get("/lookup/:studentId", requireKioskKey, ctrl.lookupForKiosk);
router.post("/register-rfid", requireKioskKey, ctrl.registerRfidForKiosk);
router.patch("/profile/:personId", requireKioskKey, ctrl.completeKioskProfile);

// Staff-facing (EMR search, master data)
router.get("/roster/:personId", requireAuth, requireRole("superadmin"), ctrl.getRosterRecord);
router.patch("/roster/:personId/rfid", requireAuth, requireRole("superadmin"), ctrl.resetRosterRfid);
router.patch("/roster/:personId/reset-profile", requireAuth, requireRole("superadmin"), ctrl.resetRosterProfile);
router.patch("/roster/:personId/archive", requireAuth, requireRole("superadmin"), ctrl.archiveRosterRecord);
router.delete("/roster/:personId", requireAuth, requireRole("superadmin"), ctrl.deleteRosterRecord);
router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist"), ctrl.listStudents);
router.get("/:id/emr", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist"), ctrl.getFullEmr);
router.post("/bulk-upload", requireAuth, requireRole("superadmin"), ctrl.bulkUpsertStudents);

export default router;
