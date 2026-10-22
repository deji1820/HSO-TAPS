import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import QueueEntry from "../models/QueueEntry.js";

const router = Router();
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function getManilaDayRange(now = new Date()) {
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const start = Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate()) - MANILA_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + 24 * 60 * 60 * 1000) };
}

// Public waiting-room display: expose only queue numbers and their current state.
router.get("/board", async (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const { start, end } = getManilaDayRange();
  const entries = await QueueEntry.find({
    status: { $in: ["waiting", "called", "in_session"] },
    createdAt: { $gte: start, $lt: end },
  })
    .select("queueNumber status createdAt")
    .sort({ createdAt: 1 })
    .lean();
  res.json({
    serving: entries.filter((entry) => ["called", "in_session"].includes(entry.status)).map(({ queueNumber, status }) => ({ queueNumber, status })),
    waiting: entries.filter((entry) => entry.status === "waiting").map(({ queueNumber }) => ({ queueNumber })),
  });
});

router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const role = String(req.user.role || "").toLowerCase();
  const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(role);
  const { start, end } = getManilaDayRange();
  let query = QueueEntry.find({ status: "waiting", createdAt: { $gte: start, $lt: end } })
    .populate("student", "studentId firstName lastName program department")
    .sort({ createdAt: 1 });
  if (clinicalRole) query = query.populate("linkedVitals");
  const entries = await query;
  if (clinicalRole) return res.json(entries);
  res.json(entries.map((entry) => {
    const safeEntry = entry.toObject();
    delete safeEntry.reason;
    delete safeEntry.requestDetails;
    delete safeEntry.linkedVitals;
    return safeEntry;
  }));
});

router.get("/history", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const role = String(req.user.role || "").toLowerCase();
  const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(role);
  const { start, end } = getManilaDayRange();
  let query = QueueEntry.find({
    calledAt: { $gte: start, $lt: end },
    status: { $in: ["called", "in_session", "completed", "cancelled"] },
  })
    .populate("student", "studentId firstName lastName program department")
    .sort({ calledAt: -1 });
  if (clinicalRole) query = query.populate("linkedVitals");
  const entries = await query;
  if (clinicalRole) return res.json(entries);
  res.json(entries.map((entry) => {
    const safeEntry = entry.toObject();
    delete safeEntry.reason;
    delete safeEntry.requestDetails;
    delete safeEntry.linkedVitals;
    return safeEntry;
  }));
});

router.patch("/:id/status", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), async (req, res) => {
  const io = req.app.get("io");
  const { status } = req.body; // "called" | "in_session" | "completed" | "cancelled"
  const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(String(req.user.role || "").toLowerCase());
  const allowedStatuses = clinicalRole ? ["called", "in_session", "completed", "cancelled"] : ["called", "cancelled"];
  if (!allowedStatuses.includes(status)) return res.status(403).json({ message: "You do not have access to this queue action" });
  const current = await QueueEntry.findById(req.params.id).select("status");
  if (!current) return res.status(404).json({ message: "Queue entry not found" });
  const allowedCurrentStatuses = {
    called: ["waiting"],
    in_session: ["called", "in_session"],
    completed: ["in_session"],
    cancelled: ["waiting", "called", "in_session"],
  }[status];
  if (!allowedCurrentStatuses.includes(current.status)) {
    return res.status(409).json({ message: "This queue entry has already been called or is no longer active" });
  }
  const timestampField = { called: "calledAt", in_session: "startedAt", completed: "completedAt" }[status];
  const update = { status, ...(timestampField ? { [timestampField]: new Date() } : {}) };
  const entry = await QueueEntry.findOneAndUpdate({ _id: req.params.id, status: current.status }, update, { new: true }).populate("student").populate("linkedVitals");
  if (!entry) return res.status(409).json({ message: "This queue entry has already changed" });
  io?.to("clinical-queue").emit("queue:update", entry);
  io?.to("frontdesk-queue").emit("queue:update", { _id: entry._id, status: entry.status, calledAt: entry.calledAt, startedAt: entry.startedAt, completedAt: entry.completedAt });
  if (clinicalRole) return res.json(entry);
  const safeEntry = entry.toObject();
  delete safeEntry.reason;
  delete safeEntry.requestDetails;
  delete safeEntry.linkedVitals;
  res.json(safeEntry);
});

export default router;
