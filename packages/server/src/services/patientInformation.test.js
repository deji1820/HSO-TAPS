import test from "node:test";
import assert from "node:assert/strict";
import { applyDeclarationToPatient, calculateAge, declarationRequiresReview, declarationSubmissionAction, decoratePatientYearLevel, expectedYearLevel, materialDeclarationChanges, parseAcademicYearStart, validateDeclaration } from "./patientInformation.js";
import { requireRole } from "../middleware/auth.js";

test("age is calculated from the date of birth on the clinic calendar date", () => {
  assert.equal(calculateAge("2000-10-27", new Date("2026-10-26T16:30:00.000Z")), 26); // Oct 27 in Manila
  assert.equal(calculateAge("2000-10-28", new Date("2026-10-26T16:30:00.000Z")), 25);
  assert.equal(calculateAge("2027-02-01", new Date("2026-10-27T00:00:00.000Z")), null);
  assert.equal(calculateAge("2000-02-30"), null);
});

test("expected student year level follows configured academic-year rollover", () => {
  assert.equal(parseAcademicYearStart("AY 2026-2027"), 2026);
  assert.equal(expectedYearLevel("2023-230083", "Student", "2026-2027"), "4th Year");
  assert.equal(expectedYearLevel("2023-230083", "Student", "2027-2028"), "5th Year");
  assert.equal(expectedYearLevel("2023-230083", "Employee", "2026-2027"), null);
  assert.equal(expectedYearLevel("bad-id", "Student", "2026-2027"), null);
  assert.equal(expectedYearLevel("2023-230083", "Student", "2026-2028"), null);
});

test("authorized year-level override remains the displayed value", () => {
  const display = decoratePatientYearLevel({ studentId: "2023-230083", affiliation: "Student", yearLevel: "3rd Year", yearLevelOverride: "Irregular" }, "2026-2027");
  assert.equal(display.expectedYearLevel, "4th Year");
  assert.equal(display.displayYearLevel, "Irregular");
});

test("declaration updates About Patient fields without overwriting academic or operational values", () => {
  const patient = { _id: "patient-1", studentId: "2023-230083", affiliation: "Student", entryStatus: "Continuing", academicYear: "2026-2027", term: "Term 1", yearLevel: "3rd Year", clinicalFindings: "existing" };
  const declaration = {
    fullName: "Feleo, Delfin Joseph, D", dateOfBirth: "2000-10-27", sexAssignedAtBirth: "Male", religion: "Catholic",
    homeAddress: "Quezon City", degreeProgram: "BSIT", studentMobileNumber: "09123456789", parentGuardianName: "Guardian",
    parentGuardianContactNumber: "09987654321", hasDisability: "No", specifiedDisability: "", medicalConditions: ["Asthma"],
    healthIndicators: { question: "No" }, travelRestrictionsOrIssues: "No", treatmentConsent: "Yes",
  };
  applyDeclarationToPatient(patient, declaration, { _id: "doc-1" }, "Pending");
  assert.equal(patient.firstName, "Delfin");
  assert.equal(patient.middleName, "Joseph, D");
  assert.equal(patient.lastName, "Feleo");
  assert.equal(patient.program, "BSIT");
  assert.deepEqual(patient.healthFlags, ["Asthma"]);
  assert.equal(patient.entryStatus, "Continuing");
  assert.equal(patient.academicYear, "2026-2027");
  assert.equal(patient.term, "Term 1");
  assert.equal(patient.yearLevel, "3rd Year");
  assert.equal(patient.clinicalFindings, "existing");
});

test("declaration validation rejects invalid dates and inconsistent patient IDs", () => {
  const patient = { studentId: "2023-230083" };
  const declaration = {
    studentId: patient.studentId, fullName: "Feleo, Delfin", dateOfBirth: "2000-10-27", sexAssignedAtBirth: "Male",
    religion: "Catholic", homeAddress: "Quezon City", degreeProgram: "BSIT", studentMobileNumber: "09123456789",
    entryStatus: "Continuing (2nd, 3rd, 4th, or 5th Years)", academicYear: "AY2026-2027", term: "Term 1", parentGuardianName: "Guardian",
    parentGuardianContactNumber: "09987654321", hasDisability: "No", medicalConditions: ["None"],
    healthIndicators: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`q${index}`, "No"])),
    treatmentConsent: "Yes", treatmentSignature: "Delfin Feleo", travelRestrictionsOrIssues: "No",
    finalDeclarationConsent: "Yes", finalDeclarationSignature: "Delfin Feleo",
  };
  assert.equal(validateDeclaration(declaration, patient), null);
  assert.match(validateDeclaration({ ...declaration, dateOfBirth: "2000-02-30" }, patient), /valid date of birth/i);
  assert.match(validateDeclaration({ ...declaration, studentId: "other-id" }, patient), /does not match/i);
});

test("one-time submission and edit-review policy allows only rejected resubmission", () => {
  assert.equal(declarationSubmissionAction(undefined), "create");
  assert.equal(declarationSubmissionAction("Pending"), "block");
  assert.equal(declarationSubmissionAction("Verified"), "block");
  assert.equal(declarationSubmissionAction("Rejected"), "resubmit");
  assert.equal(declarationRequiresReview("Verified"), true);
  assert.equal(declarationRequiresReview("Rejected"), true);
  assert.deepEqual(materialDeclarationChanges({ address: "A" }, { address: "B" }), ["address"]);
});

test("only authorized admin role passes the declaration correction route guard", () => {
  const guard = requireRole("superadmin");
  let nextCalled = false;
  guard({ user: { role: "nurse" } }, { status(code) { this.code = code; return this; }, json() {} }, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  let adminNextCalled = false;
  guard({ user: { role: "superadmin" } }, { status() { return this; }, json() {} }, () => { adminNextCalled = true; });
  assert.equal(adminNextCalled, true);
});
