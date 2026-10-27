import { useState } from "react";
import { updateQueueStatus } from "../services/api.js";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/NewMedicalRecord.css";

const providerTarget = (serviceType) => serviceType === "Dental Consultation" ? "dentist" : "physician";
const EXAM_FIELDS = ["Height (cm)", "Weight (kg)", "Abdomen", "Ears", "Eyes, Pupils", "Heart", "Lungs", "Nose", "Skin", "Thorax", "Extremities", "Deformities"];
const keyFor = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const initialFields = (entry) => entry.nursingAssessment?.fields || {};
const initialNotes = (entry) => entry.nursingAssessment?.notes || "";
const summary = (fields, keys) => keys.map((key) => fields[key] ? `${key.replaceAll("_", " ")}: ${fields[key]}` : "").filter(Boolean).join("\n");

export default function NursingAssessmentModal({ entry, onClose, onRouted, onSaved }) {
  const existing = entry.nursingAssessment || {};
  const [physicalOn, setPhysicalOn] = useState(existing.physicalExamIncluded ?? Boolean(existing.physicalExam || Object.values(existing.fields || {}).some(Boolean)));
  const [labOn, setLabOn] = useState(existing.laboratoryExamIncluded ?? Boolean(existing.laboratoryExamination));
  const [fields, setFields] = useState(initialFields(entry));
  const [notes, setNotes] = useState(initialNotes(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const examKeys = ["blood_pressure_systolic", "blood_pressure_diastolic", ...EXAM_FIELDS.map(keyFor), "physical_other_findings"];
  const hasExam = physicalOn && examKeys.some((key) => String(fields[key] || "").trim());
  const hasLab = labOn && ["chest_xray", "lab_significant_findings", "cardio_clearance", "lab_remarks"].some((key) => String(fields[key] || "").trim());
  const canRoute = hasExam || hasLab;

  function payload() {
    return { physicalExam: physicalOn ? summary(fields, examKeys) : "", laboratoryExamination: labOn ? summary(fields, ["chest_xray", "lab_significant_findings", "cardio_clearance", "lab_remarks"]) : "", physicalExamIncluded: physicalOn, laboratoryExamIncluded: labOn, fields, notes };
  }

  async function save(status) {
    setSaving(true); setError("");
    try {
      const updated = await updateQueueStatus(entry._id, status, { nursingAssessment: payload() });
      if (status === "awaiting_provider") onRouted(updated);
      else onSaved(updated);
    } catch (err) { setError(err.response?.data?.message || (status === "awaiting_provider" ? "Could not save and route this patient." : "Could not save the nursing assessment draft.")); }
    finally { setSaving(false); }
  }

  return <div className="active-session-overlay" onMouseDown={onClose}>
    <section className="active-session-modal" onMouseDown={(event) => event.stopPropagation()} aria-label="New Medical Record nursing assessment" role="dialog" aria-modal="true">
      <header className="active-session-header"><span>New Medical Record · {entry.queueNumber || "Patient"}</span><button className="active-session-close" onClick={onClose} aria-label="Close">×</button></header>
      <div className="active-session-body">
        <div className="record-summary"><div><h2>{entry.student?.lastName}, {entry.student?.firstName}</h2><p>Student ID: {entry.student?.studentId || "—"}</p><p>Department: {entry.student?.program || entry.student?.department || "—"}</p><p>Official Email: {entry.student?.email || "—"}</p></div><div><p>Date of Examination: {new Date().toLocaleString()}</p><p>Service: {entry.medicalWorkflow?.purpose || entry.serviceType}</p><p>Assigned Provider: {providerTarget(entry.serviceType)}</p></div></div>

        <section className="record-section"><h2>Physical Examination</h2><label className="record-toggle"><input type="checkbox" checked={physicalOn} onChange={(event) => setPhysicalOn(event.target.checked)} /><span>{physicalOn ? "On" : "Off"}</span> Physical Examination</label>{physicalOn && <div className="exam-grid"><label>Blood Pressure<div className="bp-fields"><input className="text-input" inputMode="numeric" value={fields.blood_pressure_systolic || ""} onChange={(event) => setFields((current) => ({ ...current, blood_pressure_systolic: event.target.value }))} placeholder="Systolic" /><input className="text-input" inputMode="numeric" value={fields.blood_pressure_diastolic || ""} onChange={(event) => setFields((current) => ({ ...current, blood_pressure_diastolic: event.target.value }))} placeholder="Diastolic" /></div></label>{EXAM_FIELDS.map((label) => <label key={label}>{label}<input className="text-input" value={fields[keyFor(label)] || ""} onChange={(event) => setFields((current) => ({ ...current, [keyFor(label)]: event.target.value }))} /></label>)}<label className="exam-wide">Other Pertinent Findings<textarea className="text-input" rows={3} value={fields.physical_other_findings || ""} onChange={(event) => setFields((current) => ({ ...current, physical_other_findings: event.target.value }))} /></label></div>}</section>

        <section className="record-section"><h2>Laboratory Examination</h2><label className="record-toggle"><input type="checkbox" checked={labOn} onChange={(event) => setLabOn(event.target.checked)} /><span>{labOn ? "On" : "Off"}</span> Laboratory Examination</label>{labOn && <div className="exam-grid lab-grid"><fieldset><legend>Chest X-Ray</legend>{["Normal", "For Repeated Chest X-Ray"].map((value) => <label key={value}><input type="radio" name="nurse-chest-xray" checked={fields.chest_xray === value} onChange={() => setFields((current) => ({ ...current, chest_xray: value }))} /> {value}</label>)}</fieldset><label className="exam-wide">Significant Findings<textarea className="text-input" rows={2} value={fields.lab_significant_findings || ""} onChange={(event) => setFields((current) => ({ ...current, lab_significant_findings: event.target.value }))} /></label><fieldset><legend>Cardio Clearance</legend>{["Cleared", "With Significant Findings"].map((value) => <label key={value}><input type="radio" name="nurse-cardio" checked={fields.cardio_clearance === value} onChange={() => setFields((current) => ({ ...current, cardio_clearance: value }))} /> {value}</label>)}</fieldset><label className="exam-wide">Remarks<textarea className="text-input" rows={2} value={fields.lab_remarks || ""} onChange={(event) => setFields((current) => ({ ...current, lab_remarks: event.target.value }))} /></label></div>}</section>

        <section className="record-section"><h2>Nursing Notes / Handoff</h2><textarea className="text-input" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add nursing observations or handoff notes" /></section>
        {!canRoute && <p className="field-hint">Record at least one physical or laboratory examination finding before routing this encounter to the provider.</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="active-session-actions"><button className="btn btn-outline" onClick={() => save("in_session")} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button><button className="btn btn-primary" disabled={saving || !canRoute} onClick={() => save("awaiting_provider")}>{saving ? "Saving…" : `Save and Route to ${providerTarget(entry.serviceType)}`}</button></div>
      </div>
    </section>
  </div>;
}
