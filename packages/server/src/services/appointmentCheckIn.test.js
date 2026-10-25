import test from "node:test";
import assert from "node:assert/strict";
import { checkInEligibility } from "./appointmentCheckIn.js";

const acceptedToday = { status: "scheduled", decisionStatus: "accepted", dateKey: "2026-10-25" };

test("allows an accepted appointment to check in on its scheduled date", () => {
  assert.deepEqual(checkInEligibility(acceptedToday, "2026-10-25"), { eligible: true });
});

test("rejects check-in before the appointment date", () => {
  assert.match(checkInEligibility({ ...acceptedToday, dateKey: "2026-10-26" }, "2026-10-25").reason, /appointment date/i);
});

test("rejects check-in when the appointment is pending or cancelled", () => {
  assert.match(checkInEligibility({ ...acceptedToday, decisionStatus: "pending" }, "2026-10-25").reason, /accepted/i);
  assert.match(checkInEligibility({ ...acceptedToday, status: "cancelled" }, "2026-10-25").reason, /scheduled/i);
});

test("recognizes a check-in that already has its linked queue entry", () => {
  const result = checkInEligibility({ ...acceptedToday, status: "checked_in", queueEntry: "queue-id" }, "2026-10-25");
  assert.equal(result.alreadyCheckedIn, true);
});
