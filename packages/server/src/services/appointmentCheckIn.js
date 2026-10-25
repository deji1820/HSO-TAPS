export function checkInEligibility(appointment, today) {
  if (!appointment) return { eligible: false, reason: "Appointment not found." };
  if (appointment.status === "checked_in" && appointment.queueEntry) {
    return { eligible: false, alreadyCheckedIn: true, reason: "This appointment is already checked in." };
  }
  if (appointment.status !== "scheduled") return { eligible: false, reason: "Only scheduled appointments can be checked in." };
  if (appointment.decisionStatus !== "accepted") return { eligible: false, reason: "The appointment must be accepted before check-in." };
  if (appointment.dateKey !== today) return { eligible: false, reason: "Check-in is available on the appointment date." };
  return { eligible: true };
}
