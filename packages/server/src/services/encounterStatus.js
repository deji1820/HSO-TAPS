const ENCOUNTER_STATUS = Object.freeze({
  waiting: Object.freeze({ value: "checked_in", label: "Checked In" }),
  called: Object.freeze({ value: "awaiting_nurse_assessment", label: "Awaiting Nurse Assessment" }),
  in_session: Object.freeze({ value: "intake_in_progress", label: "Intake In Progress" }),
  awaiting_provider: Object.freeze({ value: "awaiting_clinician", label: "Awaiting Physician or Dentist" }),
  provider_in_session: Object.freeze({ value: "consultation_in_progress", label: "Consultation In Progress" }),
  completed: Object.freeze({ value: "completed", label: "Completed" }),
  cancelled: Object.freeze({ value: "cancelled", label: "Cancelled" }),
  expired: Object.freeze({ value: "expired", label: "Expired" }),
});

export function getEncounterStatus(queueStatus) {
  return ENCOUNTER_STATUS[queueStatus] || { value: queueStatus || "unknown", label: queueStatus || "Unknown" };
}

export { ENCOUNTER_STATUS };
