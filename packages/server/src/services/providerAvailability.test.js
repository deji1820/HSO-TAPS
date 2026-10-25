import test from "node:test";
import assert from "node:assert/strict";
import { providerRoleMatches, slotFitsSchedule, validWeekdays } from "./providerAvailability.js";

test("restricts medical and dental assignments to the matching provider role", () => {
  assert.equal(providerRoleMatches("Medical Consultation", "physician"), true);
  assert.equal(providerRoleMatches("Medical Consultation", "doctor"), true);
  assert.equal(providerRoleMatches("Medical Consultation", "dentist"), false);
  assert.equal(providerRoleMatches("Dental Consultation", "dentist"), true);
  assert.equal(providerRoleMatches("Dental Consultation", "physician"), false);
});

test("requires the full 30-minute appointment slot to fit provider hours", () => {
  const schedule = { startTime: "08:00", endTime: "12:00", slotMinutes: 30 };
  assert.equal(slotFitsSchedule("8:00 AM", schedule), true);
  assert.equal(slotFitsSchedule("11:30 AM", schedule), true);
  assert.equal(slotFitsSchedule("12:00 PM", schedule), false);
});

test("accepts unique Monday-to-Saturday schedule weekdays", () => {
  assert.equal(validWeekdays([1, 3, 5]), true);
  assert.equal(validWeekdays([0, 1]), false);
  assert.equal(validWeekdays([2, 2]), false);
  assert.equal(validWeekdays([]), false);
});
