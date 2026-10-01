import { useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/MedicalClearance.css";

// Replace these sample requirements with the HSO-approved document matrix.
export const CLEARANCE_PURPOSES = [
  { id: "employment", label: "Employment / Pre-employment", document: "Employer clearance request or referral" },
  { id: "internship", label: "Internship / OJT", document: "School or placement endorsement" },
  { id: "sports", label: "Sports / Physical Education", document: "Sports or PE participation request" },
  { id: "other", label: "Other medical clearance", document: "Request letter from the requesting office" },
];

export default function ClearanceIntakeScreen({ onSubmit, onBack, onFaq, isOnline, isAppointment = false }) {
  const [purposeId, setPurposeId] = useState("");
  const [checkedDocuments, setCheckedDocuments] = useState([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const purpose = CLEARANCE_PURPOSES.find((item) => item.id === purposeId);
  const documents = purpose ? ["Valid NU student ID", purpose.document] : [];
  const ready = !!purpose && (isAppointment || (checkedDocuments.length === documents.length && acknowledged)) && !loading;

  function toggleDocument(document) {
    setCheckedDocuments((current) => current.includes(document)
      ? current.filter((item) => item !== document)
      : [...current, document]);
  }

  async function handleProceed() {
    if (!ready) {
      setShowWarning(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit({ purpose: purpose.label, documents });
    } catch {
      setError("We couldn't complete your check-in. Please try again or see the clinic staff.");
      setLoading(false);
    }
  }

  function handlePurposeChange(event) {
    setPurposeId(event.target.value);
    setCheckedDocuments([]);
    setShowWarning(false);
    setError("");
  }

  return (
    <div className="kiosk-shell clearance-screen clearance-intake">
      <KioskHeader isOnline={isOnline} />
      <main className={`clearance-content${isAppointment ? " clearance-book-purpose" : ""}`}>
        {!isAppointment && showWarning && <div className="clearance-alert">Please confirm you have all required documents before proceeding.</div>}
        <div className="clearance-heading">
          <p>SERVICE: MEDICAL CLEARANCE &gt; {isAppointment ? "BOOK AN APPOINTMENT" : "WALK-IN CLEARANCE"}</p>
          <h1>Select your purpose to review requirements</h1>
        </div>

        <section className="clearance-panel clearance-purpose-panel">
          <h2>MEDICAL CLEARANCE PURPOSE</h2>
          <p className="clearance-hint">Select medical clearance purpose and review the required documents.</p>
          <select value={purposeId} onChange={handlePurposeChange} aria-label="Medical clearance purpose">
            <option value="">Select an option</option>
            {CLEARANCE_PURPOSES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        </section>

        <section className="clearance-panel clearance-documents-panel">
          <h2>REQUIRED DOCUMENTS</h2>
          {purpose && !isAppointment ? (
            <div className="clearance-document-list">
              {documents.map((document) => (
                <label key={document}>
                  <input
                    type="checkbox"
                    checked={checkedDocuments.includes(document)}
                    onChange={() => toggleDocument(document)}
                  />
                  {document}
                </label>
              ))}
            </div>
          ) : (
            <p className="clearance-empty-documents">{isAppointment
              ? "<< displays the required documents list for the selected medical clearance purpose >>"
              : "Select a purpose to view its required document checklist."}</p>
          )}
        </section>

        {!isAppointment && <p className="clearance-policy">
          By checking the required items, you confirm that you have complete physical or soft copies on hand. Incomplete documents may result in cancellation at the attending desk to prevent queue delays.
        </p>}
        {!isAppointment && <label className="clearance-acknowledge">
          <input type="checkbox" checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); setShowWarning(false); }} />
          I understand that missing requirements may cancel my appointment today.
        </label>}
        {error && <p className="clearance-error" role="alert">{error}</p>}
        <div className="clearance-actions">
          <button className="clearance-back" onClick={onBack} disabled={loading}>&lt;&lt; Back</button>
          <button className="clearance-proceed" onClick={handleProceed} disabled={loading || (isAppointment && !purpose)}>
            {loading ? "Please wait..." : "Proceed >>"}
          </button>
        </div>
        <a className="clearance-faq" href="#faq" onClick={(event) => { event.preventDefault(); onFaq?.(); }}>
          Frequently Asked Questions (FAQ’s)
        </a>
      </main>
    </div>
  );
}
