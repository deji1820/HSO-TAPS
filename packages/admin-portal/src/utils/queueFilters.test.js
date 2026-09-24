import test from "node:test";
import assert from "node:assert/strict";
import { filterQueueEntries } from "./queueFilters.js";

const entries = [
  { serviceType: "Medical Consultation", priorityLevel: "Standard Priority" },
  { serviceType: "Dental Consultation", priorityLevel: "High Priority" },
  { serviceType: "Medical Clearance", priorityLevel: "Standard Priority" },
  { serviceType: "Prescription/OTC Pickup", priorityLevel: "Standard Priority" },
  { serviceType: "General Inquiry", priorityLevel: "Standard Priority" },
  { serviceType: "Quick Health Screening", priorityLevel: "High Priority" },
];

test("shows entries from every service when service filter is All", () => {
  assert.equal(filterQueueEntries(entries).length, 6);
});

test("filters a specific service", () => {
  assert.deepEqual(
    filterQueueEntries(entries, { serviceFilter: "Medical Clearance" }),
    [entries[2]]
  );
});

test("combines service and priority filters", () => {
  assert.deepEqual(
    filterQueueEntries(entries, { serviceFilter: "Quick Health Screening", priorityFilter: "High Priority" }),
    [entries[5]]
  );
});
