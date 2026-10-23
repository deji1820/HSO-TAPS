import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import QueueEntry from "../models/QueueEntry.js";

const router = Router();
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

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
  const entries = await QueueEntry.find({
    status: { $in: ["waiting", "called", "in_session", "awaiting_provider", "provider_in_session"] },
  })
    .select("queueNumber status createdAt")
    .sort({ createdAt: 1 })
    .lean();
  res.json({
    serving: entries.filter((entry) => ["called", "in_session", "awaiting_provider", "provider_in_session"].includes(entry.status)).map(({ queueNumber, status }) => ({ queueNumber, status })),
    waiting: entries.filter((entry) => entry.status === "waiting").map(({ queueNumber }) => ({ queueNumber })),
  });
});

router.get("/", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const role = String(req.user.role || "").toLowerCase();
  const providerRole = ["physician", "doctor", "dentist"].includes(role);
  const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(role);
  const queryFilter = {
    status: { $in: providerRole ? ["awaiting_provider", "provider_in_session"] : ["waiting", "called", "in_session", "awaiting_provider", "provider_in_session"] },
  };
  if (providerRole) queryFilter.serviceType = role === "dentist" ? "Dental Consultation" : { $in: ["Medical Consultation", "Medical Clearance"] };
  let query = QueueEntry.find(queryFilter)
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
    delete safeEntry.nursingAssessment;
    return safeEntry;
  }));
});

router.get("/history", requireAuth, requireRole("nurse", "supervisor", "physician", "dentist", "staff"), async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const role = String(req.user.role || "").toLowerCase();
  const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(role);
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
    // Active entries stay in the live workflow until a provider completes them.
    status: { $in: ["completed", "cancelled"] },
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
  const { status } = req.body;
  const role = String(req.user.role || "").toLowerCase();
  const isNurse = ["nurse", "supervisor"].includes(role);
  const isProvider = ["physician", "doctor", "dentist"].includes(role);
  const transitions = {
    called: { roles: ["nurse", "supervisor", "staff"], from: ["waiting"] },
    in_session: { roles: ["nurse", "supervisor"], from: ["called"] },
    awaiting_provider: { roles: ["nurse", "supervisor"], from: ["in_session"] },
    provider_in_session: { roles: ["physician", "doctor", "dentist"], from: ["awaiting_provider"] },
    cancelled: { roles: ["nurse", "supervisor", "physician", "doctor", "dentist", "staff"], from: ["waiting", "called", "in_session", "awaiting_provider", "provider_in_session"] },
  };
  const transition = transitions[status];
  if (!transition || !transition.roles.includes(role)) return res.status(403).json({ message: "You do not have access to this queue action" });
  const current = await QueueEntry.findById(req.params.id).select("status serviceType");
  if (!current) return res.status(404).json({ message: "Queue entry not found" });
  if (status === "in_session" && current.status === "in_session" && isNurse) {
    const assessment = req.body.nursingAssessment || {};
    const nursingAssessment = {
      physicalExam: String(assessment.physicalExam || "").trim().slice(0, 4000),
      laboratoryExamination: String(assessment.laboratoryExamination || "").trim().slice(0, 4000),
      notes: String(assessment.notes || "").trim().slice(0, 4000),
      recordedBy: req.user.id,
      recordedAt: new Date(),
    };
    const entry = await QueueEntry.findOneAndUpdate({ _id: req.params.id, status: "in_session" }, { nursingAssessment }, { new: true }).populate("student").populate("linkedVitals");
    if (!entry) return res.status(409).json({ message: "This queue entry has already changed" });
    io?.to("clinical-queue").emit("queue:update", entry);
    io?.to("frontdesk-queue").emit("queue:update", { _id: entry._id, status: entry.status, calledAt: entry.calledAt, startedAt: entry.startedAt, completedAt: entry.completedAt });
    return res.json(entry);
  }
  if (!transition.from.includes(current.status)) {
    return res.status(409).json({ message: "This queue entry has already been called or is no longer active" });
  }
  if (status === "provider_in_session" && ((role === "dentist" && current.serviceType !== "Dental Consultation") || (role !== "dentist" && current.serviceType === "Dental Consultation"))) {
    return res.status(403).json({ message: "This encounter must be handled by the matching physician or dentist." });
  }
  const timestampField = { called: "calledAt", in_session: "startedAt", provider_in_session: "providerStartedAt" }[status];
  const update = { status, ...(timestampField ? { [timestampField]: new Date() } : {}) };
  if (status === "awaiting_provider") {
    const assessment = req.body.nursingAssessment || {};
    const physicalExam = String(assessment.physicalExam || "").trim().slice(0, 4000);
    const laboratoryExamination = String(assessment.laboratoryExamination || "").trim().slice(0, 4000);
    const notes = String(assessment.notes || "").trim().slice(0, 4000);
    if (!physicalExam && !laboratoryExamination && !notes) {
      return res.status(400).json({ message: "Save the nursing examination or assessment notes before routing to the provider." });
    }
    update.nursingAssessment = { physicalExam, laboratoryExamination, notes, recordedBy: req.user.id, recordedAt: new Date() };
  }
  const entry = await QueueEntry.findOneAndUpdate({ _id: req.params.id, status: current.status }, update, { new: true }).populate("student").populate("linkedVitals");
  if (!entry) return res.status(409).json({ message: "This queue entry has already changed" });
  io?.to("clinical-queue").emit("queue:update", entry);
  io?.to("frontdesk-queue").emit("queue:update", { _id: entry._id, status: entry.status, calledAt: entry.calledAt, startedAt: entry.startedAt, completedAt: entry.completedAt });
  if (isNurse || isProvider) return res.json(entry);
  const safeEntry = entry.toObject();
  delete safeEntry.reason;
  delete safeEntry.requestDetails;
  delete safeEntry.linkedVitals;
  delete safeEntry.nursingAssessment;
  res.json(safeEntry);
});

export default router;
