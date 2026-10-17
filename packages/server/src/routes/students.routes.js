import { Router } from "express";
import { requireAuth, requireKioskKey, requireRole } from "../middleware/auth.js";
import * as ctrl from "../controllers/students.controller.js";

const router = Router();

// Kiosk-facing (RFID tap / manual entry lookup)
router.get("/lookup/:studentId", requireKioskKey, ctrl.lookupForKiosk);

// Staff-facing (EMR search, master data)
router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist"), ctrl.listStudents);
router.get("/:id/emr", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist"), ctrl.getFullEmr);
router.post("/bulk-upload", requireAuth, requireRole("superadmin"), ctrl.bulkUpsertStudents);

export default router;
