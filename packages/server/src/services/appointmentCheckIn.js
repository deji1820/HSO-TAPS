import { getQueueExpirationMinutes } from "./queueExpiration.service.js";

function scheduledStart(appointment) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(appointment?.timeSlot || "");
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  const start = new Date(`${appointment.dateKey}T${String(hour).padStart(2, "0")}:${match[2]}:00+08:00`);
  return Number.isNaN(start.valueOf()) ? null : start;
}

export function checkInEligibility(appointment, today, now = new Date()) {
  if (!appointment) return { eligible: false, reason: "Appointment not found." };
  if (appointment.status === "checked_in" && appointment.queueEntry) {
    return { eligible: false, alreadyCheckedIn: true, reason: "This appointment is already checked in." };
  }
  if (appointment.status !== "scheduled") return { eligible: false, reason: "Only scheduled appointments can be checked in." };
  if (appointment.decisionStatus !== "accepted") return { eligible: false, reason: "The appointment must be accepted before check-in." };
  if (appointment.noShowExempt !== true) {
    if (appointment.dateKey !== today) return { eligible: false, reason: "Check-in is available on the appointment date unless a clinic staff member has recorded an exception." };
    const startsAt = appointment.timeSlot ? scheduledStart(appointment) : null;
    if (appointment.timeSlot && (!startsAt || now.getTime() >= startsAt.getTime() + getQueueExpirationMinutes() * 60_000)) {
      return { eligible: false, reason: "The appointment has passed its check-in grace period and is marked as a no-show." };
    }
  }
  return { eligible: true };
}
