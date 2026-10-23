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

function parseManilaDateStart(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utcDay = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcDay);
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return new Date(utcDay - MANILA_OFFSET_MS);
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
  const todayStart = getManilaDayRange().start;
  const { from, to } = req.query;
  const fromStart = from ? parseManilaDateStart(from) : null;
  const toStart = to ? parseManilaDateStart(to) : null;
  if ((from && !fromStart) || (to && !toStart)) {
    return res.status(400).json({ message: "Use valid dates for the history range." });
  }
  if (fromStart && toStart && fromStart > toStart) {
    return res.status(400).json({ message: "The start date must be on or before the end date." });
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = 50;
  const match = {
    // Today's waiting entries stay in the live list; everything from past days
    // and all entries already called today belong in the archive.
    $or: [
      { createdAt: { $lt: todayStart } },
      { status: { $ne: "waiting" } },
    ],
  };
  if (fromStart || toStart) {
    match.createdAt = {
      ...(fromStart ? { $gte: fromStart } : {}),
      ...(toStart ? { $lt: new Date(toStart.getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }

  let entriesQuery = QueueEntry.find(match)
    .populate("student", "studentId firstName lastName program department")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize);
  if (clinicalRole) entriesQuery = entriesQuery.populate("linkedVitals");
  const [total, entries] = await Promise.all([
    QueueEntry.countDocuments(match),
    entriesQuery,
  ]);
  const safeEntries = clinicalRole ? entries : entries.map((entry) => {
    const safeEntry = entry.toObject();
    delete safeEntry.reason;
    delete safeEntry.requestDetails;
    delete safeEntry.linkedVitals;
    return safeEntry;
  });
  res.json({ entries: safeEntries, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
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
