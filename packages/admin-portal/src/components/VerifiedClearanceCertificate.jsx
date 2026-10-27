import "../styles/components/VerifiedClearanceCertificate.css";

const purposeHeading = (purpose = "Medical Clearance") => ({
  "OJT Medical Clearance": "ON-THE-JOB TRAINING CLEARANCE",
  "Sports Medical Clearance (U-WEEK, NFG)": "SPORTS MEDICAL CLEARANCE",
  "New Enrollee Clearance (Medical / Dental)": "NEW ENROLLEE MEDICAL AND DENTAL CLEARANCE",
}[purpose] || String(purpose).toUpperCase());

export default function VerifiedClearanceCertificate({ certificate, onClose }) {
  if (!certificate) return null;
  const clearance = certificate.submissionDetails?.clearance || {};
  const patient = clearance.patient || {};
  const patientName = patient.name || [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Patient";
  const verification = clearance.verification || {};
  const priorApproval = clearance.approval || {};
  const sourceDocument = clearance.sourceDocument || {};
  const issuedAt = priorApproval.approvedAt || clearance.issueDate || verification.verifiedAt || certificate.submittedAt || certificate.createdAt;
  const providerApproved = Boolean(priorApproval.providerName);

  return <div className="clearance-certificate-preview-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="clearance-certificate-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="clearance-certificate-title">
      <div className="clearance-certificate-preview-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Close</button><button type="button" className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button></div>
      <article className="clearance-certificate-print-area">
        <header className="clearance-certificate-heading"><img src="/assets/nu-crest.png" alt="National University Fairview crest" /><div><p>NATIONAL UNIVERSITY FAIRVIEW</p><h2>HEALTH SERVICES OFFICE</h2><h1 id="clearance-certificate-title">{purposeHeading(clearance.purpose)}</h1><strong>{providerApproved ? "MEDICAL CLEARANCE CERTIFICATE" : "CLEARANCE DOCUMENT VERIFICATION CERTIFICATE"}</strong></div></header>
        <p className="clearance-certificate-reference">Certificate reference: {certificate._id}</p>
        <p className="clearance-certificate-body">{providerApproved ? <>This certifies that <strong>{patientName}</strong> ({patient.affiliation || "Patient"} ID: {patient.studentId || "—"}) completed the recorded requirements for <strong>{clearance.purpose}</strong> and was approved by the authorized provider.</> : <>This certifies that the submitted document for <strong>{clearance.purpose}</strong> belonging to <strong>{patientName}</strong> ({patient.affiliation || "Patient"} ID: {patient.studentId || "—"}) was reviewed and verified by the Health Services Office.</>}</p>
        {(sourceDocument.title || sourceDocument.name) && <p><strong>Verified document:</strong> {sourceDocument.title || sourceDocument.name}{sourceDocument.examDate ? ` · dated ${new Date(sourceDocument.examDate).toLocaleDateString()}` : ""}</p>}
        {providerApproved ? <p><strong>Provider determination:</strong> {priorApproval.providerStatement}</p> : <><p><strong>Verification remarks:</strong> {verification.remarks || "No additional remarks."}</p><p className="clearance-certificate-limitation">This certificate confirms document verification for the stated purpose. It is not a clinical fitness determination and does not replace any required examination or provider assessment.</p></>}
        <p>Issued on {issuedAt ? new Date(issuedAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }) : "—"}.</p>
        <div className="clearance-certificate-signature"><strong>{providerApproved ? priorApproval.providerName : verification.verifiedBy || "Authorized HSO Staff"}</strong><span>{providerApproved ? priorApproval.providerRole : verification.verifierRole || "Nurse"}</span><span>Health Services Office</span></div>
      </article>
    </section>
  </div>;
}
