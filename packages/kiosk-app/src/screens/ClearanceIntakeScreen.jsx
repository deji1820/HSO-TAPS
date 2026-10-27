import { useEffect, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import { getClearanceRequirements } from "../services/api.js";
import "../styles/screens/MedicalClearance.css";

export default function ClearanceIntakeScreen({ onSubmit, onBack, onFaq, isOnline, isAppointment = false, affiliation = "Student" }) {
  const [purposeId, setPurposeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requirementsData, setRequirementsData] = useState([]);
  const [requirementsLoading, setRequirementsLoading] = useState(true);
  const [requirementsError, setRequirementsError] = useState("");

  useEffect(() => {
    let active = true;
    getClearanceRequirements()
      .then(({ items = [] }) => { if (active) setRequirementsData(items); })
      .catch(() => { if (active) setRequirementsError("Clearance requirements are unavailable. Please try again before proceeding."); })
      .finally(() => { if (active) setRequirementsLoading(false); });
    return () => { active = false; };
  }, []);

  const purposes = requirementsData.filter((item) => item.clearance && item.affiliation === affiliation);
  const purpose = purposes.find((item) => item.purpose === purposeId);
  const documents = purpose?.requirements || [];
  const confirmableDocuments = documents.filter((item) => item.kind === "document" && item.required);
  const ready = !!purpose && !requirementsLoading && !requirementsError && !loading;

  async function handleProceed() {
    if (!purpose) {
      setError("Select a medical clearance purpose to continue.");
      return;
    }
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      await onSubmit({ purpose: purpose.purpose, affiliation: purpose.affiliation, requirements: documents, documents: confirmableDocuments.map((item) => item.text) });
    } catch {
      setError("We couldn't complete your check-in. Please try again or see the clinic staff.");
      setLoading(false);
    }
  }

  function handlePurposeChange(event) {
    setPurposeId(event.target.value);
    setError("");
  }

  return (
    <div className="kiosk-shell clearance-screen clearance-intake">
      <KioskHeader isOnline={isOnline} />
      <main className={`clearance-content${isAppointment ? " clearance-book-purpose" : ""}`}>
        <div className="clearance-heading">
          <p>SERVICE: MEDICAL CLEARANCE &gt; {isAppointment ? "BOOK AN APPOINTMENT" : "WALK-IN CLEARANCE"}</p>
          <h1>Select your purpose to review requirements</h1>
        </div>

        <section className="clearance-panel clearance-purpose-panel">
          <h2>MEDICAL CLEARANCE PURPOSE</h2>
          <p className="clearance-hint">Select medical clearance purpose and review its requirements from the HSO system notes.</p>
          <label className="clearance-field-label">Affiliation
            <select value={affiliation} disabled aria-label="Affiliation from verified profile">
              <option>Student</option><option>Employee</option>
            </select>
          </label>
          <label className="clearance-field-label">Purpose
          <select value={purposeId} onChange={handlePurposeChange} aria-label="Medical clearance purpose">
            <option value="">Select an option</option>
            {purposes.map((item) => <option value={item.purpose} key={`${item.affiliation}:${item.purpose}`}>{item.purpose}</option>)}
          </select>
          </label>
        </section>

        <section className="clearance-panel clearance-documents-panel">
          <h2>REQUIREMENTS</h2>
          {purpose ? (
            <div className="clearance-document-list">
              {documents.map((requirement) => <p key={requirement.text}><strong>{requirement.kind === "document" && requirement.required ? "Required document: " : requirement.kind === "action" ? "Next step: " : "When applicable: "}</strong>{requirement.text}</p>)}
            </div>
          ) : (
            <p className="clearance-empty-documents">{requirementsLoading ? "Loading the HSO requirements list…" : "Select a purpose to view its requirements."}</p>
          )}
        </section>

        {!isAppointment && purpose && <p className="clearance-policy">Bring the documents listed above. The nurse will review them when you are called to the desk.</p>}
        {requirementsError && <p className="clearance-error" role="alert">{requirementsError}</p>}
        {error && <p className="clearance-error" role="alert">{error}</p>}
        <div className="clearance-actions">
          <button className="clearance-back" onClick={onBack} disabled={loading}>&lt;&lt; Back</button>
          <button className="clearance-proceed" onClick={handleProceed} disabled={loading || requirementsLoading || Boolean(requirementsError) || !purpose}>
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
