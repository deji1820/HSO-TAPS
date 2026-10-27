import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeSession, saveConsultationDraft } from "../services/api.js";
import useMedicineInventory, { inventoryItemLabel, isInventoryItemUnavailable } from "../hooks/useMedicineInventory.js";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/NewMedicalRecord.css";

const CLINICAL_VISIT_TYPE = { "Medical Consultation": "Walk-in Medical Consultation", "Dental Consultation": "Dental Consultation", "Medical Clearance": "Medical Clearance" };
const dateTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const readable = (key) => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ActiveSessionModal({ entry, onClose, onCompleted }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const saved = entry.consultationRecord || {};
  const student = entry.student || {};
  const vitals = entry.linkedVitals || {};
  const [bloodPressure, setBloodPressure] = useState(saved.vitalsSnapshot?.bloodPressure || vitals.bloodPressure || "");
  const [pulseRate, setPulseRate] = useState(saved.vitalsSnapshot?.pulseRate ?? vitals.pulseRate ?? "");
  const [spo2, setSpo2] = useState(saved.vitalsSnapshot?.spo2 ?? vitals.spo2 ?? "");
  const [subjective, setSubjective] = useState(saved.subjective || "");
  const [objective, setObjective] = useState(saved.objective || "");
  const [assessment, setAssessment] = useState(saved.assessment || entry.medicalWorkflow?.diagnosis || "");
  const [plan, setPlan] = useState(saved.plan || entry.medicalWorkflow?.treatment || "");
  const [intakeFields, setIntakeFields] = useState({ ...(entry.medicalWorkflow?.initialFields || {}) });
  const [nursingAssessment, setNursingAssessment] = useState({ physicalExam: entry.nursingAssessment?.physicalExam || "", laboratoryExamination: entry.nursingAssessment?.laboratoryExamination || "", notes: entry.nursingAssessment?.notes || "", physicalExamIncluded: Boolean(entry.nursingAssessment?.physicalExamIncluded), laboratoryExamIncluded: Boolean(entry.nursingAssessment?.laboratoryExamIncluded), fields: { ...(entry.nursingAssessment?.fields || {}) } });
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const { inventoryItems, inventoryLoading, inventoryError } = useMedicineInventory();
  const selectedMedicine = inventoryItems.find((item) => item._id === selectedMedicineId);
  const [quantity, setQuantity] = useState(saved.otc?.quantity || "");
  const [otcInstructions, setOtcInstructions] = useState(saved.otc?.instructions || "");
  const [careProvided, setCareProvided] = useState(saved.firstAid?.careProvided || "");
  const [appliedTo, setAppliedTo] = useState(saved.firstAid?.appliedTo || "");
  const [restRequired, setRestRequired] = useState(saved.firstAid?.restRequired || "");
  const [verifiedIdentityAndAllergies, setVerifiedIdentityAndAllergies] = useState(Boolean(saved.safetyChecklist?.verifiedIdentityAndAllergies));
  const [confirmedNoAdverseReactions, setConfirmedNoAdverseReactions] = useState(Boolean(saved.safetyChecklist?.confirmedNoAdverseReactions));
  const [instructedDosageAndHygiene, setInstructedDosageAndHygiene] = useState(Boolean(saved.safetyChecklist?.instructedDosageAndHygiene));
  const [sessionNotes, setSessionNotes] = useState(saved.sessionNotes || "");
  const [natureOfInquiry, setNatureOfInquiry] = useState(saved.natureOfInquiry || "");
  const [inquiryResponse, setInquiryResponse] = useState(saved.inquiryResponse || "");

  const initialFields = Object.entries(intakeFields).filter(([key]) => !["diagnosis", "treatment", "treatment_remarks"].includes(key));

  useEffect(() => {
    const match = inventoryItems.find((item) => item.name === saved.otc?.itemDispensed);
    if (match && !selectedMedicineId) setSelectedMedicineId(match._id);
  }, [inventoryItems, saved.otc?.itemDispensed, selectedMedicineId]);

  function buildPayload() {
    const medicineQuantity = quantity && selectedMedicine?.unit ? `${quantity} ${selectedMedicine.unit}` : quantity;
    const visitType = CLINICAL_VISIT_TYPE[entry.serviceType]
      || (entry.serviceType === "Prescription/OTC Pickup" ? "Medication and Relief" : entry.serviceType === "General Inquiry" ? "General Inquiry" : "Walk-in Medical Consultation");
    const otc = { itemDispensed: selectedMedicine?.name || saved.otc?.itemDispensed || "", quantity: medicineQuantity, instructions: otcInstructions };
    const firstAid = { careProvided, appliedTo, restRequired };
    const safetyChecklist = { verifiedIdentityAndAllergies, confirmedNoAdverseReactions, instructedDosageAndHygiene };
    return {
      queueEntryId: entry._id,
      visitType,
      subjective, objective, assessment, plan, intakeFields, nursingAssessment,
      otc, firstAid, safetyChecklist, medicineName: otc.itemDispensed, quantity: medicineQuantity,
      otcInstructions, careProvided, appliedTo, restRequired, sessionNotes, natureOfInquiry, inquiryResponse,
      secondaryVitals: { bloodPressure, pulseRate, spo2 },
    };
  }

  async function handleSaveDraft() {
    setSaving(true); setError(""); setSyncMessage("");
    try { await saveConsultationDraft(entry._id, buildPayload()); setSyncMessage("Draft synced to Full EMR · Medical Profile."); }
    catch (saveError) { setError(saveError.response?.data?.message || "Draft could not be synced. Your entries remain here; please try again."); }
    finally { setSaving(false); }
  }

  async function handleComplete() {
    setSaving(true); setError("");
    try { const { queueEntry } = await completeSession(buildPayload()); onCompleted(queueEntry); }
    catch (saveError) { setError(saveError.response?.data?.message || "Could not save this session to the patient's EMR. Nothing was marked complete; review the required fields and try again."); }
    finally { setSaving(false); }
  }

  return <div className="active-session-overlay" onMouseDown={onClose}>
    <div className="active-session-modal active-session-modal--record" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${entry.serviceType} medical result`}>
      <header className="active-session-header"><span>{entry.serviceType} · {entry.queueNumber || "Patient"} <span className="active-session-priority">{entry.priorityLevel}</span></span><button className="active-session-close" onClick={onClose} aria-label="Close">×</button></header>
      <div className="active-session-body">
        <div className="record-summary"><div><h2>{student.lastName}, {student.firstName}</h2><p>Patient Type: {student.affiliation || "Student"}</p><p>Student ID: {student.studentId || "—"}</p><p>Department: {student.program || student.department || "—"}</p><p>Date of Birth: {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : "—"}</p><p>Official Email: {student.email || "—"}</p></div><div><p>Date of Examination: {dateTime(entry.providerStartedAt || entry.startedAt) || new Date().toLocaleString()}</p><p>Purpose: {entry.medicalWorkflow?.purpose || entry.serviceType}</p><p>Assigned Provider: {entry.serviceType === "Dental Consultation" ? "Dentist" : "Physician"}</p><div className="health-flags-row"><span className="field-label-inline">Health Flags:</span>{student.healthFlags?.length ? student.healthFlags.map((flag) => <span key={flag} className="badge badge-high">{flag}</span>) : <span>None recorded</span>}</div></div></div>

        <section className="record-section"><h2>Vital Signs</h2><div className="exam-grid"><label>Temperature (°C)<input className="text-input" value={vitals.temperatureC ?? "—"} readOnly /></label><label>Height (cm)<input className="text-input" value={vitals.heightCm ?? "—"} readOnly /></label><label>Weight (kg)<input className="text-input" value={vitals.weightKg ?? "—"} readOnly /></label><label>BMI<input className="text-input" value={vitals.bmi ?? "—"} readOnly /></label><label>Blood Pressure<input className="text-input" value={bloodPressure} onChange={(event) => setBloodPressure(event.target.value)} placeholder="e.g. 110/70" /></label><label>Pulse Rate (bpm)<input className="text-input" type="number" value={pulseRate} onChange={(event) => setPulseRate(event.target.value)} /></label><label>SpO₂ (%)<input className="text-input" type="number" value={spo2} onChange={(event) => setSpo2(event.target.value)} /></label></div></section>

        {entry.medicalWorkflow && <section className="record-section" aria-label="New medical record nurse intake"><h2>Nurse Intake</h2><p>Purpose: {entry.medicalWorkflow.purpose}</p><div className="exam-grid">{initialFields.map(([key]) => <label key={key}>{readable(key)}<input className="text-input" value={String(intakeFields[key] ?? "")} onChange={(event) => setIntakeFields((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>{!initialFields.length && <p>No additional intake findings were entered.</p>}</section>}

        {entry.nursingAssessment && <section className="record-section" aria-label="Nursing assessment and handoff"><h2>Nursing Assessment and Handoff</h2><div className="exam-grid"><label className="exam-wide">Physical examination<textarea className="text-input" rows={2} value={nursingAssessment.physicalExam} onChange={(event) => setNursingAssessment((current) => ({ ...current, physicalExam: event.target.value }))} /></label><label className="exam-wide">Laboratory examination<textarea className="text-input" rows={2} value={nursingAssessment.laboratoryExamination} onChange={(event) => setNursingAssessment((current) => ({ ...current, laboratoryExamination: event.target.value }))} /></label>{Object.entries(nursingAssessment.fields || {}).map(([key, value]) => <label key={key}>{readable(key)}<input className="text-input" value={String(value ?? "")} onChange={(event) => setNursingAssessment((current) => ({ ...current, fields: { ...current.fields, [key]: event.target.value } }))} /></label>)}<label className="exam-wide">Nursing notes<textarea className="text-input" rows={2} value={nursingAssessment.notes} onChange={(event) => setNursingAssessment((current) => ({ ...current, notes: event.target.value }))} /></label></div></section>}

        <section className="record-section"><h2>Medical Result</h2><div className="result-fields"><label>Patient Complaint<textarea className="text-input" rows={2} value={subjective} onChange={(event) => setSubjective(event.target.value)} /></label><label>Findings<textarea className="text-input" rows={2} value={objective} onChange={(event) => setObjective(event.target.value)} /></label><label>Diagnosis<textarea className="text-input" rows={2} value={assessment} onChange={(event) => setAssessment(event.target.value)} /></label><label>Treatment / Remarks<textarea className="text-input" rows={2} value={plan} onChange={(event) => setPlan(event.target.value)} /></label><label>Medicine Issued<select className="text-input" value={selectedMedicineId} onChange={(event) => { setSelectedMedicineId(event.target.value); setQuantity(""); }}><option value="">{inventoryLoading ? "Loading inventory…" : "Select medicine"}</option>{inventoryItems.map((item) => <option key={item._id} value={item._id} disabled={isInventoryItemUnavailable(item)}>{inventoryItemLabel(item)}</option>)}</select>{inventoryError && <small className="error-text">{inventoryError}</small>}{!inventoryLoading && !inventoryItems.length && <small className="record-hint">No active inventory items are available.</small>}</label><label>Quantity{selectedMedicine?.unit ? ` (${selectedMedicine.unit})` : ""}<input className="text-input" type="number" min="1" max={selectedMedicine?.quantity || undefined} value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!selectedMedicine || isInventoryItemUnavailable(selectedMedicine)} /></label><label className="exam-wide">Dosage / Instructions<textarea className="text-input" rows={2} value={otcInstructions} onChange={(event) => setOtcInstructions(event.target.value)} /></label></div></section>

        <section className="record-section"><h2>First Aid and Immediate Care</h2><div className="exam-grid"><label>Care Provided<input className="text-input" value={careProvided} onChange={(event) => setCareProvided(event.target.value)} /></label><label>Applied to<input className="text-input" value={appliedTo} onChange={(event) => setAppliedTo(event.target.value)} /></label><label>Rest Required<input className="text-input" value={restRequired} onChange={(event) => setRestRequired(event.target.value)} /></label><label className="exam-wide">Session Notes / Remarks<textarea className="text-input" rows={3} value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} /></label></div><h3>Safety and Dispensing Checklist</h3><label className="checklist-item"><input type="checkbox" checked={verifiedIdentityAndAllergies} onChange={(event) => setVerifiedIdentityAndAllergies(event.target.checked)} />Verified patient identity and checked allergy flags</label><label className="checklist-item"><input type="checkbox" checked={confirmedNoAdverseReactions} onChange={(event) => setConfirmedNoAdverseReactions(event.target.checked)} />Confirmed no adverse reactions to applied first-aid materials or oral medicine</label><label className="checklist-item"><input type="checkbox" checked={instructedDosageAndHygiene} onChange={(event) => setInstructedDosageAndHygiene(event.target.checked)} />Instructed patient on proper dosage and wound-care hygiene</label></section>

        <section className="record-section"><h2>Additional Consultation Notes</h2><div className="exam-grid"><label>Nature of Inquiry<input className="text-input" value={natureOfInquiry} onChange={(event) => setNatureOfInquiry(event.target.value)} /></label><label className="exam-wide">Inquiry Notes / Provider Response<textarea className="text-input" rows={3} value={inquiryResponse} onChange={(event) => setInquiryResponse(event.target.value)} /></label></div></section>

        {error && <p className="error-text" role="alert">{error}</p>}
        {syncMessage && <p role="status" className="field-hint">{syncMessage}</p>}
        {(!assessment.trim() || !plan.trim()) && <p className="field-hint">Enter the diagnosis and treatment or remarks before completing this consultation.</p>}
        <div className="active-session-actions"><button className="btn btn-outline" onClick={() => navigate(`/emr?studentId=${student.studentId}`)}>Open Full Medical Record</button>{entry.status === "provider_in_session" && <button className="btn btn-outline" onClick={handleSaveDraft} disabled={saving}>{saving ? "Saving…" : "Save Draft to EMR"}</button>}<button className="btn btn-primary" onClick={handleComplete} disabled={saving || !assessment.trim() || !plan.trim()}>{saving ? "Saving…" : "Mark Encounter Complete"}</button></div>
      </div>
    </div>
  </div>;
}
