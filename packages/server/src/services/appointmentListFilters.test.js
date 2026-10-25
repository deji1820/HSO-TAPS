import test from "node:test";
import assert from "node:assert/strict";
import { escapeRegex, parseAppointmentListFilters } from "./appointmentListFilters.js";

const today = "2026-10-25";

test("defaults the appointment list to today and later", () => {
  assert.deepEqual(parseAppointmentListFilters({}, today), {
    filters: { from: today, to: "", serviceType: "", decisionStatus: "", status: "", search: "", page: 1 },
  });
});

test("accepts combined service, date, decision, booking status, and search filters", () => {
  assert.deepEqual(parseAppointmentListFilters({
    from: "2026-10-26", to: "2026-10-31", serviceType: "Medical Clearance",
    decisionStatus: "pending", status: "scheduled", search: "  Jo* Doe  ", page: "3",
  }, today), {
    filters: {
      from: "2026-10-26", to: "2026-10-31", serviceType: "Medical Clearance",
      decisionStatus: "pending", status: "scheduled", search: "Jo* Doe", page: 3,
    },
  });
});

test("rejects invalid date ranges and unsupported filter values", () => {
  assert.match(parseAppointmentListFilters({ from: "2026-02-30" }, today).error, /valid dates/);
  assert.match(parseAppointmentListFilters({ from: "2026-10-30", to: "2026-10-26" }, today).error, /start date/);
  assert.match(parseAppointmentListFilters({ serviceType: "Other" }, today).error, /service/);
  assert.match(parseAppointmentListFilters({ decisionStatus: "approved" }, today).error, /decision/);
  assert.match(parseAppointmentListFilters({ status: "arrived" }, today).error, /status/);
  assert.match(parseAppointmentListFilters({ page: "0" }, today).error, /page/);
  assert.match(parseAppointmentListFilters({ page: "10001" }, today).error, /page/);
});

test("escapes user-entered text before using it in Mongo regular expressions", () => {
  assert.equal(escapeRegex("a.*[b]"), "a\\.\\*\\[b\\]");
});
