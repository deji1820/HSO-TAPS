import { Router } from "express";
import { requireAuth, requireKioskKey } from "../middleware/auth.js";
import * as ctrl from "../controllers/appointment.controller.js";

const router = Router();

router.get("/availability", requireKioskKey, ctrl.getAvailability);
router.post("/", requireKioskKey, ctrl.createAppointment);
router.get("/", requireAuth, ctrl.listAppointments);

export default router;
