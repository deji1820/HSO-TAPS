import test from "node:test";
import assert from "node:assert/strict";
import { CLEARANCE_REQUIREMENTS, findClearanceRequirement, findDocumentPurposeRequirement, listClearanceRequirements } from "./clearanceRequirements.js";

test("exposes the system-notes clearance purposes by verified affiliation", () => {
  assert.equal(listClearanceRequirements("Student", { clearanceOnly: true }).length, 9);
  assert.equal(listClearanceRequirements("Employee", { clearanceOnly: true }).length, 5);
  assert.ok(listClearanceRequirements("Employee", { clearanceOnly: true }).every(({ affiliation }) => affiliation === "Employee"));
});

test("uses the documented OJT, sports, and new employee requirements", () => {
  const ojt = findClearanceRequirement("Student", "OJT Medical Clearance");
  assert.deepEqual(ojt.requirements.map(({ text }) => text), ["Updated Chest X-ray result (issued within 6 months)."]);

  const sports = findClearanceRequirement("Student", "Sports Medical Clearance (U-WEEK, NFG)");
  assert.match(sports.requirements[1].text, /ECG result.*3 months/i);
  assert.equal(sports.requirements[1].conditional, true);
  assert.match(sports.requirements[1].condition, /competitive or physical sports/i);

  const completion = findClearanceRequirement("Student", "Completion of Medical Records (Continuing Students Only)");
  assert.ok(completion.requirements.some((item) => item.conditional && /X-ray/i.test(item.text)));
  assert.ok(completion.requirements.some((item) => item.conditional && item.kind === "action" && /dental examination/i.test(item.text)));

  const employee = findClearanceRequirement("Employee", "New Employee Clearance");
  assert.equal(employee.requirements.filter(({ kind, required }) => kind === "document" && required).length, 5);
});

test("rejects a purpose that does not match affiliation and retains legacy label aliases", () => {
  assert.equal(findClearanceRequirement("Employee", "OJT Medical Clearance"), null);
  assert.equal(findClearanceRequirement("Student", "Sports Medical Clearance (U-WEEK NFG)").purpose, "Sports Medical Clearance (U-WEEK, NFG)");
  assert.ok(findDocumentPurposeRequirement("Student", "Health Status Declaration Form"));
  assert.equal(CLEARANCE_REQUIREMENTS.filter(({ purpose }) => purpose === "Health Status Declaration Form").length, 1);
});
