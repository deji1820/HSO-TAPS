const CLINIC_TIME_ZONE = "Asia/Manila";

function dateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, Number(part)]));
}

export function calculateAge(dateOfBirth, now = new Date()) {
  if (!dateOfBirth) return null;
  const dateString = typeof dateOfBirth === "string" ? dateOfBirth.slice(0, 10) : null;
  let birth;
  if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-").map(Number);
    const valid = new Date(Date.UTC(year, month - 1, day));
    if (valid.getUTCFullYear() !== year || valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day) return null;
    birth = { year, month, day };
  } else {
    const date = new Date(dateOfBirth);
    if (Number.isNaN(date.valueOf())) return null;
    birth = dateParts(date, "UTC");
  }
  const today = dateParts(now, CLINIC_TIME_ZONE);
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function parseAcademicYearStart(academicYear) {
  const match = /^(?:AY\s*)?(\d{4})\s*[-–/]\s*(\d{4})$/i.exec(String(academicYear || "").trim());
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  return Number(match[1]);
}

export function expectedYearLevel(studentId, affiliation, academicYear) {
  if (affiliation !== "Student") return null;
  const match = /^(\d{4})-\d{6,7}$/.exec(String(studentId || "").trim());
  const startYear = parseAcademicYearStart(academicYear);
  if (!match || !startYear) return null;
  const level = startYear - Number(match[1]) + 1;
  if (level < 1 || level > 8) return null;
  const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
  return `${level}${suffix} Year`;
}

export function decoratePatientYearLevel(patient, academicYear) {
  if (!patient) return patient;
  const value = typeof patient.toObject === "function" ? patient.toObject({ virtuals: true }) : { ...patient };
  const expected = expectedYearLevel(value.studentId, value.affiliation, academicYear);
  value.expectedYearLevel = expected;
  value.displayYearLevel = value.affiliation === "Student" ? value.yearLevelOverride || expected || value.yearLevel || null : null;
  return value;
}

export function declarationStatusLabel(status) {
  return ({ Pending: "Pending Verification", Verified: "Verified", Rejected: "Rejected" })[status] || "Not Submitted";
}

export function declarationRequiresReview(status) {
  return status === "Verified" || status === "Rejected";
}

export function declarationSubmissionAction(status) {
  if (!status) return "create";
  return status === "Rejected" ? "resubmit" : "block";
}

export function validateDeclaration(declaration, student) {
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) return "Declaration data must be an object.";
  const dob = String(declaration.dateOfBirth || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || calculateAge(dob) === null) return "Enter a valid date of birth that is not in the future.";
  if (declaration.studentId && String(declaration.studentId).trim() !== student.studentId) return "The declaration ID does not match the verified patient.";
  if (!String(declaration.fullName || "").trim() || String(declaration.fullName).length > 160) return "A valid full name is required.";
  const entryStatuses = ["Freshman (Select if Grade 11)", "Transferee", "Second-Degree Takers", "Graduate Studies", "Cross-enrollee", "Continuing (2nd, 3rd, 4th, or 5th Years)"];
  if (!entryStatuses.includes(declaration.entryStatus)) return "Select a valid entry status.";
  const academicYear = String(declaration.academicYear || "").trim().replace(/^AY\s*/i, "");
  if (!parseAcademicYearStart(academicYear)) return "Enter a valid academic year such as AY2026-2027.";
  if (!["Term 1", "Term 2", "Term 3"].includes(declaration.term)) return "Select a valid academic term.";
  if (!["Male", "Female"].includes(declaration.sexAssignedAtBirth || declaration.sex)) return "Select a valid sex assigned at birth.";
  if (!Array.isArray(declaration.medicalConditions) || declaration.medicalConditions.length === 0) return "Select at least one medical-history option.";
  if (!declaration.healthIndicators || typeof declaration.healthIndicators !== "object" || Array.isArray(declaration.healthIndicators)) return "Complete the health-screen indicators.";
  const indicators = Object.values(declaration.healthIndicators);
  if (indicators.length < 12 || indicators.some((value) => !["Yes", "No"].includes(value))) return "Answer every health-screen indicator with Yes or No.";
  if (["Yes", "No"].includes(declaration.hasDisability) === false) return "Complete the disability declaration.";
  if (declaration.hasDisability === "Yes" && !String(declaration.specifiedDisability || "").trim()) return "Specify the declared disability.";
  if (!String(declaration.homeAddress || "").trim()) return "Home address is required.";
  if (!String(declaration.studentMobileNumber || "").trim()) return "Student mobile number is required.";
  if (!/^\d{11}$/.test(String(declaration.studentMobileNumber))) return "Enter an 11-digit student mobile number.";
  if (!String(declaration.parentGuardianName || "").trim() || !/^\d{11}$/.test(String(declaration.parentGuardianContactNumber || ""))) return "Enter the parent or guardian name and 11-digit contact number.";
  if (!String(declaration.religion || "").trim() || !String(declaration.degreeProgram || "").trim()) return "Religion and program or department are required.";
  if (String(declaration.religion).length > 100 || String(declaration.degreeProgram).length > 160 || String(declaration.homeAddress).length > 500) return "One or more declaration fields exceed the allowed length.";
  if (!["Yes", "No"].includes(declaration.treatmentConsent) || !String(declaration.treatmentSignature || "").trim()) return "Complete and sign the treatment consent.";
  if (!["Yes", "No"].includes(declaration.finalDeclarationConsent) || !String(declaration.finalDeclarationSignature || "").trim()) return "Complete and sign the final declaration.";
  if (!["Yes", "No"].includes(declaration.travelRestrictionsOrIssues)) return "Complete the travel health declaration.";
  return null;
}

export function normalizeDeclaration(declaration, student) {
  const normalized = { ...declaration, studentId: student.studentId };
  delete normalized.age;
  for (const key of ["fullName", "religion", "homeAddress", "degreeProgram", "studentMobileNumber", "entryStatus", "academicYear", "term", "parentGuardianName", "parentGuardianContactNumber", "specifiedDisability", "treatmentSignature", "finalDeclarationSignature"]) {
    if (typeof normalized[key] === "string") normalized[key] = normalized[key].trim().slice(0, key === "homeAddress" ? 500 : 200);
  }
  if (Array.isArray(normalized.medicalConditions)) normalized.medicalConditions = [...new Set(normalized.medicalConditions.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, 40);
  if (normalized.healthIndicators && typeof normalized.healthIndicators === "object" && !Array.isArray(normalized.healthIndicators)) {
    normalized.healthIndicators = Object.fromEntries(Object.entries(normalized.healthIndicators).slice(0, 20).map(([question, answer]) => [String(question).slice(0, 250), answer]));
  }
  return normalized;
}

function splitFullName(fullName) {
  const value = String(fullName || "").trim().replace(/\s+/g, " ");
  if (value.includes(",")) {
    const [last, rest] = value.split(/,(.*)/s).slice(0, 2);
    const pieces = String(rest || "").trim().split(" ").filter(Boolean);
    return { firstName: pieces.shift() || "", middleName: pieces.join(" "), lastName: last.trim() };
  }
  const pieces = value.split(" ").filter(Boolean);
  return { firstName: pieces.shift() || "", lastName: pieces.pop() || "", middleName: pieces.join(" ") };
}

/** Apply only fields owned by the declaration; academic, term, and clinical fields are not touched. */
export function applyDeclarationToPatient(student, declaration, document, status = "Pending") {
  const name = splitFullName(declaration.fullName);
  if (name.firstName && name.lastName) Object.assign(student, name);
  const [year, month, day] = declaration.dateOfBirth.split("-").map(Number);
  student.dateOfBirth = new Date(Date.UTC(year, month - 1, day));
  student.sex = declaration.sexAssignedAtBirth || declaration.sex;
  student.religion = String(declaration.religion || "").trim();
  student.homeAddress = String(declaration.homeAddress || "").trim();
  if (student.affiliation === "Student") student.program = String(declaration.degreeProgram || "").trim();
  else student.department = String(declaration.degreeProgram || declaration.institutionalAffiliation || student.department || "").trim();
  student.mobileNumber = String(declaration.studentMobileNumber || "").trim();
  student.guardianName = String(declaration.parentGuardianName || "").trim();
  student.guardianContact = String(declaration.parentGuardianContactNumber || "").trim();
  student.hasDisability = declaration.hasDisability === "Yes";
  student.specifiedDisability = student.hasDisability ? String(declaration.specifiedDisability || "").trim() : "";
  student.healthFlags = declaration.medicalConditions.filter((condition) => !/not applicable/i.test(condition));
  student.healthIndicators = { ...declaration.healthIndicators };
  student.travelRestrictionsOrIssues = String(declaration.travelRestrictionsOrIssues || "");
  student.treatmentConsent = String(declaration.treatmentConsent || "");
  student.healthDeclarationRecord = document._id;
  student.healthDeclarationStatus = status;
  student.healthDeclarationVerifiedAt = status === "Verified" ? document.verifiedAt || null : null;
  return student;
}

export function materialDeclarationChanges(previous = {}, next = {}) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)].filter((key) => key !== "age"));
  const normalize = (value) => JSON.stringify(value ?? null);
  return [...keys].filter((key) => normalize(previous[key]) !== normalize(next[key]));
}
