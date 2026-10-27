import { useState } from "react";
import { updateQueueStatus } from "../services/api.js";
import "../styles/components/ActiveSessionModal.css";

const providerTarget = (serviceType) => serviceType === "Dental Consultation" ? "dentist" : "physician";

export default function NursingAssessmentModal({ entry, onClose, onRouted, onSaved }) {
  const existing = entry.nursingAssessment || {};
  const [physicalExam, setPhysicalExam] = useState(existing.physicalExam || "");
  const [laboratoryExamination, setLaboratoryExamination] = useState(existing.laboratoryExamination || "");
  const [notes, setNotes] = useState(existing.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function routeToProvider() {
    setSaving(true);
    setError("");
    try {
      const updated = await updateQueueStatus(entry._id, "awaiting_provider", {
        nursingAssessment: { physicalExam, laboratoryExamination, notes },
      });
      onRouted(updated);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save and route this patient.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError("");
    try {
      const updated = await updateQueueStatus(entry._id, "in_session", {
        nursingAssessment: { physicalExam, laboratoryExamination, notes },
      });
      onSaved(updated);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save the nursing assessment draft.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="active-session-overlay" onMouseDown={onClose}>
    <section className="active-session-modal" onMouseDown={(event) => event.stopPropagation()} aria-label="Nursing assessment">
      <header className="active-session-header"><span>Nursing assessment — {entry.queueNumber || "Patient"}</span><button className="active-session-close" onClick={onClose} aria-label="Close">×</button></header>
      <div className="active-session-body">
        <div className="card patient-info-block"><strong>{entry.student?.firstName} {entry.student?.lastName}</strong><div>{entry.serviceType}</div><p>{entry.assignedProviderRole ? `This session is assigned to the ${entry.assignedProviderRole} queue. Record the nursing intake, then route it for provider consultation.` : `Starting the nursing intake assigns this session to the ${providerTarget(entry.serviceType)} queue. Record the physical or laboratory assessment, then route it for provider consultation.`}</p></div>
        <label className="field-label" htmlFor="nursing-physical">Physical examination</label>
        <textarea id="nursing-physical" className="text-input" rows={4} value={physicalExam} onChange={(event) => setPhysicalExam(event.target.value)} />
        <label className="field-label" htmlFor="nursing-lab">Laboratory examination</label>
        <textarea id="nursing-lab" className="text-input" rows={4} value={laboratoryExamination} onChange={(event) => setLaboratoryExamination(event.target.value)} />
        <label className="field-label" htmlFor="nursing-notes">Nursing notes / handoff</label>
        <textarea id="nursing-notes" className="text-input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        {!(physicalExam.trim() || laboratoryExamination.trim()) && <p className="field-hint">Record a physical or laboratory examination before routing to the provider. Notes alone do not complete the initial assessment.</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="active-session-actions"><button className="btn btn-outline" onClick={saveDraft} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button><button className="btn btn-primary" disabled={saving || !(physicalExam.trim() || laboratoryExamination.trim())} onClick={routeToProvider}>{saving ? "Saving…" : `Save and route to ${providerTarget(entry.serviceType)}`}</button></div>
      </div>
    </section>
  </div>;
}
