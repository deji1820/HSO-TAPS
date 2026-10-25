const document = (text, required = true) => ({ text, kind: "document", required });
const action = (text) => ({ text, kind: "action", required: false });
const guidance = (text) => ({ text, kind: "guidance", required: false });

// Canonical source: HSO-TAP SYSTEM NOTES, "Medical Clearance Purpose and Requirements List".
export const CLEARANCE_REQUIREMENTS = [
  { affiliation: "Student", purpose: "OJT Medical Clearance", requirements: [document("Updated Chest X-ray result (issued within 6 months).")], clearance: true },
  { affiliation: "Student", purpose: "Validation of Medical Certificate", requirements: [document("Outside medical certificate for official validation.")], clearance: true },
  { affiliation: "Student", purpose: "Off-Campus Tour Medical Clearance", requirements: [action("Coordinate with HSO personnel prior to the appointment to confirm complete medical records on file.")], clearance: true },
  { affiliation: "Student", purpose: "Sports Medical Clearance (U-WEEK, NFG)", requirements: [document("Updated Chest X-ray result (issued within 6 months)."), guidance("Updated ECG result (issued within 3 months), required especially for competitive or physical sports.")], clearance: true },
  { affiliation: "Student", purpose: "New Enrollee Clearance (Medical / Dental)", requirements: [document("Updated Chest X-ray result (issued within 6 months)."), action("Physical and dental examination will be conducted on the booked appointment date.")], clearance: true },
  { affiliation: "Student", purpose: "SHS Work Immersion", requirements: [document("Updated Chest X-ray result (issued within 6 months).")], clearance: true },
  { affiliation: "Student", purpose: "Completion of Medical Records (Continuing Students Only)", requirements: [action("Check NUIS clearance issues prior to visit."), guidance("If the X-ray is missing, bring an updated Chest X-ray result (issued within 6 months)."), guidance("If the dental exam is missing, attend the booked appointment."), action("Coordinate with HSO personnel for other deficiencies.")], clearance: true },
  { affiliation: "Student", purpose: "Issuance of Medical Certificate (Illness-Related)", requirements: [guidance("If you consulted the clinic during the illness, bring any diagnostic or laboratory results, if available."), guidance("If you did not consult the clinic during the illness, obtain a medical certificate from an outside doctor and select Validation of Medical Certificate.")], clearance: true },
  { affiliation: "Student", purpose: "Medical and Dental Consultations ONLY", requirements: [guidance("Bring any available diagnostic or laboratory results for doctor review.")], clearance: true },
  { affiliation: "Employee", purpose: "New Employee Clearance", requirements: [document("Latest Chest X-ray (photocopy)."), document("Complete Blood Count (CBC) (photocopy)."), document("Urinalysis (photocopy)."), document("Fecalysis (photocopy)."), document("Drug test (photocopy)."), action("Physical and dental examination will be conducted on the booked appointment date.")], clearance: true },
  { affiliation: "Employee", purpose: "Review of Annual Physical Exam (APE) Results", requirements: [guidance("If the APE was done inside NU Fairview, coordinate with HSO personnel beforehand if printed results are required."), guidance("If the APE was done outside NU Fairview, bring a complete photocopy of the APE results.")], clearance: true },
  { affiliation: "Employee", purpose: "Validation of Medical Certificate", requirements: [document("Outside medical certificate for official validation.")], clearance: true },
  { affiliation: "Employee", purpose: "Issuance of Medical Certificate (Illness-Related)", requirements: [guidance("If you consulted the clinic during the illness, bring any diagnostic or laboratory results, if available."), guidance("If you did not consult the clinic during the illness, obtain a medical certificate from an outside doctor and select Validation of Medical Certificate.")], clearance: true },
  { affiliation: "Employee", purpose: "Medical and Dental Consultations ONLY", requirements: [guidance("Bring any available diagnostic or laboratory results for doctor or dentist review.")], clearance: true },
  { affiliation: "Student", purpose: "Health Status Declaration Form", requirements: [action("Complete the Health Status Declaration Form and submit it to your health record.")], documentSubmission: true },
];

export function normalizeClearanceAffiliation(value) {
  return String(value || "").toLowerCase() === "employee" ? "Employee" : "Student";
}

export function listClearanceRequirements(affiliation, { clearanceOnly = false } = {}) {
  const normalized = normalizeClearanceAffiliation(affiliation);
  return CLEARANCE_REQUIREMENTS.filter((item) => item.affiliation === normalized && (!clearanceOnly || item.clearance));
}

export function findClearanceRequirement(affiliation, purpose) {
  const normalized = normalizeClearanceAffiliation(affiliation);
  const aliases = {
    "Sports Medical Clearance (U-WEEK NFG)": "Sports Medical Clearance (U-WEEK, NFG)",
    "Medical / Dental Consultation": "Medical and Dental Consultations ONLY",
  };
  const canonicalPurpose = aliases[purpose] || purpose;
  return CLEARANCE_REQUIREMENTS.find((item) => item.affiliation === normalized && item.purpose === canonicalPurpose && item.clearance) || null;
}

export function findDocumentPurposeRequirement(affiliation, purpose) {
  const normalized = normalizeClearanceAffiliation(affiliation);
  const aliases = {
    "Sports Medical Clearance (U-WEEK NFG)": "Sports Medical Clearance (U-WEEK, NFG)",
    "Medical / Dental Consultation": "Medical and Dental Consultations ONLY",
  };
  purpose = aliases[purpose] || purpose;
  return CLEARANCE_REQUIREMENTS.find((item) => item.affiliation === normalized && item.purpose === purpose && (item.clearance || item.documentSubmission)) || null;
}
