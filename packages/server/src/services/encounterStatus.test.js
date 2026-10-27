import test from "node:test";
import assert from "node:assert/strict";
import { getEncounterStatus } from "./encounterStatus.js";

test("maps persisted queue lifecycle values to explicit encounter workflow statuses", () => {
  assert.deepEqual(getEncounterStatus("waiting"), { value: "checked_in", label: "Checked In" });
  assert.deepEqual(getEncounterStatus("called"), { value: "awaiting_nurse_assessment", label: "Awaiting Nurse Assessment" });
  assert.deepEqual(getEncounterStatus("in_session"), { value: "intake_in_progress", label: "Intake In Progress" });
  assert.deepEqual(getEncounterStatus("awaiting_provider"), { value: "awaiting_clinician", label: "Awaiting Physician or Dentist" });
  assert.deepEqual(getEncounterStatus("provider_in_session"), { value: "consultation_in_progress", label: "Consultation In Progress" });
  assert.deepEqual(getEncounterStatus("completed"), { value: "completed", label: "Completed" });
  assert.deepEqual(getEncounterStatus("cancelled"), { value: "cancelled", label: "Cancelled" });
  assert.deepEqual(getEncounterStatus("expired"), { value: "expired", label: "Expired" });
});

test("preserves unknown persisted values visibly instead of relabeling them Pending", () => {
  assert.deepEqual(getEncounterStatus("legacy_state"), { value: "legacy_state", label: "legacy_state" });
});
