import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import QueueEntry from "../models/QueueEntry.js";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const entries = await QueueEntry.find({ status: { $in: ["waiting", "called", "in_session"] } })
    .populate("student")
    .populate("linkedVitals")
    .sort({ createdAt: 1 });
  res.json(entries);
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  const io = req.app.get("io");
  const { status } = req.body; // "called" | "in_session" | "completed" | "cancelled"
  const timestampField = { called: "calledAt", in_session: "startedAt", completed: "completedAt" }[status];
  const update = { status, ...(timestampField ? { [timestampField]: new Date() } : {}) };
  const entry = await QueueEntry.findByIdAndUpdate(req.params.id, update, { new: true }).populate("student").populate("linkedVitals");
  if (!entry) return res.status(404).json({ message: "Queue entry not found" });
  io?.emit("queue:update", entry);
  res.json(entry);
});

export default router;
