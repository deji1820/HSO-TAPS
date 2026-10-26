import Appointment from "../models/Appointment.js";
import QueueEntry from "../models/QueueEntry.js";
import MedicalWorkflow from "../models/MedicalWorkflow.js";

const MANILA_OFFSET = "+08:00";

export function getQueueExpirationMinutes() {
  const configured = Number(process.env.QUEUE_EXPIRATION_MINUTES);
  return Number.isInteger(configured) && configured >= 1 && configured <= 1440 ? configured : 30;
}

function manilaToday(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function appointmentStart(appointment) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(appointment.timeSlot || "");
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(appointment.dateKey || "")) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  const date = new Date(`${appointment.dateKey}T${String(hour).padStart(2, "0")}:${match[2]}:00${MANILA_OFFSET}`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

/** Mark unattended walk-ins and accepted bookings as expired without deleting their records. */
export async function expireStaleEntries(io, now = new Date()) {
  const expirationMinutes = getQueueExpirationMinutes();
  const cutoff = new Date(now.getTime() - expirationMinutes * 60_000);
  const walkInQuery = {
    status: { $in: ["waiting", "called"] },
    expirationExempt: { $ne: true },
    $or: [{ appointment: { $exists: false } }, { appointment: null }],
    createdAt: { $lte: cutoff },
  };
  const walkIns = await QueueEntry.find(walkInQuery).select("_id status").lean();
  for (const { _id, status } of walkIns) {
    const expired = await QueueEntry.findOneAndUpdate(
      { ...walkInQuery, _id, status },
      {
        $set: { status: "expired", expiredAt: now, expiredReason: `No service started within ${expirationMinutes} minutes of joining the walk-in queue.` },
        $push: { statusHistory: { from: status, to: "expired", actor: "system", at: now, reason: `Queue entry expired after ${expirationMinutes} minutes without service.` } },
      },
      { new: true },
    ).lean();
    if (expired) {
      await MedicalWorkflow.findOneAndUpdate(
        { queueEntry: expired._id, status: { $nin: ["approved", "completed", "cancelled", "expired"] } },
        {
          $set: { status: "expired" },
          $push: { events: { type: "expired", description: "Clinical queue entry expired before service began.", at: now } },
        },
      );
      io?.to("clinical-queue").to("frontdesk-queue").emit("queue:update", { _id: expired._id, status: "expired" });
    }
  }

  const missedAppointments = await Appointment.find({
    dateKey: { $lte: manilaToday(now) },
    status: "scheduled",
    decisionStatus: "accepted",
    noShowExempt: { $ne: true },
    $or: [{ queueEntry: { $exists: false } }, { queueEntry: null }],
  }).select("_id dateKey timeSlot").lean();
  for (const appointment of missedAppointments) {
    const startsAt = appointmentStart(appointment);
    if (!startsAt || now.getTime() < startsAt.getTime() + expirationMinutes * 60_000) continue;
    const noShow = await Appointment.findOneAndUpdate(
      { _id: appointment._id, status: "scheduled", decisionStatus: "accepted", noShowExempt: { $ne: true }, $or: [{ queueEntry: { $exists: false } }, { queueEntry: null }] },
      {
        $set: { status: "no_show", noShowAt: now },
        $push: { statusHistory: { from: "scheduled", to: "no_show", actor: "system", at: now, reason: `Not checked in within ${expirationMinutes} minutes of the scheduled appointment time.` } },
      },
      { new: true },
    ).select("_id status").lean();
    if (noShow) io?.emit("appointment:update", { _id: noShow._id, status: "no_show" });
  }
}

export function startQueueExpirationScheduler(io) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await expireStaleEntries(io);
    } catch (error) {
      console.error("[queue-expiration] Could not expire stale entries:", error.message);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  return timer;
}
