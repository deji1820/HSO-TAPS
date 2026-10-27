import Appointment from "../models/Appointment.js";
import { sendAppointmentReminderNotification } from "./documentNotifications.service.js";

const MANILA_OFFSET = "+08:00";

function manilaToday(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function appointmentStartAt(appointment) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(appointment.timeSlot || "");
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(appointment.dateKey || "")) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  const value = new Date(`${appointment.dateKey}T${String(hour).padStart(2, "0")}:${match[2]}:00${MANILA_OFFSET}`);
  return Number.isNaN(value.valueOf()) ? null : value;
}

export async function sendDueAppointmentReminders(now = new Date()) {
  const appointments = await Appointment.find({ dateKey: manilaToday(now), status: "scheduled", decisionStatus: "accepted" })
    .populate("student", "firstName email")
    .select("serviceType purpose dateKey timeSlot notificationEmail student status decisionStatus");
  let attempted = 0;
  for (const appointment of appointments) {
    const startsAt = appointmentStartAt(appointment);
    const minutesUntilStart = startsAt ? startsAt.getTime() - now.getTime() : NaN;
    if (!Number.isFinite(minutesUntilStart) || minutesUntilStart <= 0 || minutesUntilStart > 60 * 60_000) continue;
    const result = await sendAppointmentReminderNotification(appointment);
    if (result.sent) attempted += 1;
  }
  return attempted;
}

export function startAppointmentReminderScheduler() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendDueAppointmentReminders();
    } catch (error) {
      console.error("[appointment-reminder] Could not send due reminders:", error.message);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  return timer;
}
