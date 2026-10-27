import ExternalDocument from "../models/ExternalDocument.js";
import User from "../models/User.js";
import { findClearanceRequirement } from "./clearanceRequirements.js";

export function clearancePurposeFor(document) {
  if (document?.clearanceWorkflow) return null;
  const purpose = String(document?.submissionDetails?.purpose || "").trim();
  const affiliation = document?.student?.affiliation || "Student";
  return findClearanceRequirement(affiliation, purpose) ? purpose : null;
}

export async function issueVerifiedClearanceDocument(document, actor) {
  const purpose = clearancePurposeFor(document);
  if (!purpose || document.status !== "Verified" || !document.student) return null;
  const verifiedBy = document.verifiedBy?._id || document.verifiedBy || actor;
  const verifier = verifiedBy ? await User.findById(verifiedBy).select("name role") : null;
  const issuedAt = document.verifiedAt || new Date();
  const patient = document.student;
  try {
    return await ExternalDocument.findOneAndUpdate(
      { sourceDocument: document._id },
      { $setOnInsert: {
        student: patient._id || patient,
        recordType: "clearance_certificate",
        sourceDocument: document._id,
        documentTitle: `Clearance Verification Certificate — ${purpose}`,
        formSource: "HSO Nurse Verification",
        category: "Medical Clearance Certificate",
        status: "Issued",
        submittedAt: issuedAt,
        verifiedBy,
        verifiedAt: issuedAt,
        verificationHistory: [{ status: "Issued", remarks: "Generated after HSO staff verified the submitted document.", actor: verifiedBy, at: issuedAt }],
        submissionDetails: { clearance: {
          purpose,
          patient: {
            studentId: patient.studentId,
            affiliation: patient.affiliation,
            name: [patient.firstName, patient.lastName].filter(Boolean).join(" "),
            program: patient.program,
            department: patient.department,
          },
          sourceDocument: { id: document._id, title: document.documentTitle, name: document.name, category: document.category, examDate: document.examDate },
          verification: { verifiedBy: verifier?.name || "Authorized HSO Nurse", verifierRole: verifier?.role || "nurse", verifiedAt: issuedAt, remarks: document.verificationRemarks || "" },
          statement: `This certifies that the submitted document for ${purpose} was reviewed and verified by the Health Services Office. This certificate records document verification only and is not a clinical fitness determination.`,
        } },
      } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return ExternalDocument.findOne({ sourceDocument: document._id });
  }
}
