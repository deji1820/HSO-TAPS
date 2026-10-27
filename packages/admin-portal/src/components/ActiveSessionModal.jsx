import { useEffect, useState } from "react";
import { completeSession, saveConsultationDraft } from "../services/api.js";
import useMedicineInventory, { inventoryItemLabel, isInventoryItemUnavailable } from "../hooks/useMedicineInventory.js";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/NewMedicalRecord.css";

const CLINICAL_VISIT_TYPE = { "Medical Consultation": "Walk-in Medical Consultation", "Dental Consultation": "Dental Consultation" };
const EXAM_FIELDS = ["Height (cm)", "Weight (kg)", "Abdomen", "Ears", "Eyes, Pupils", "Heart", "Lungs", "Nose", "Skin", "Thorax", "Extremities", "Deformities"];
const keyFor = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const summary = (fields, keys) => keys.map((key) => fields[key] ? `${key.replaceAll("_", " ")}: ${fields[key]}` : "").filter(Boolean).join("\n");
const providerTarget = (serviceType) => serviceType === "Dental Consultation" ? "dentist" : "physician";

export default function ActiveSessionModal({ entry, onClose, onCompleted }) {
  const saved = entry.consultationRecord || {};
  const student = entry.student || {};
  const existingAssessment = entry.nursingAssessment || {};
  const fieldsAtStart = existingAssessment.fields || {};
  const [physicalOn, setPhysicalOn] = useState(existingAssessment.physicalExamIncluded ?? Boolean(existingAssessment.physicalExam || Object.values(fieldsAtStart).some(Boolean)));
  const [labOn, setLabOn] = useState(existingAssessment.laboratoryExamIncluded ?? Boolean(existingAssessment.laboratoryExamination));
  const [fields, setFields] = useState({ ...fieldsAtStart });
  const [handoffNotes, setHandoffNotes] = useState(existingAssessment.notes || "");
  const [subjective, setSubjective] = useState(saved.subjective || "");
  const [objective, setObjective] = useState(saved.objective || "");
  const [assessment, setAssessment] = useState(saved.assessment || entry.medicalWorkflow?.diagnosis || "");
  const [plan, setPlan] = useState(saved.plan || entry.medicalWorkflow?.treatment || "");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const { inventoryItems, inventoryLoading, inventoryError } = useMedicineInventory();
  const selectedMedicine = inventoryItems.find((item) => item._id === selectedMedicineId);
  const [quantity, setQuantity] = useState(saved.otc?.quantity || "");
  const [instructions, setInstructions] = useState(saved.otc?.instructions || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const examKeys = ["blood_pressure_systolic", "blood_pressure_diastolic", ...EXAM_FIELDS.map(keyFor), "physical_other_findings"];
  const labKeys = ["chest_xray", "lab_significant_findings", "cardio_clearance", "lab_remarks"];

  useEffect(() => {
    const match = inventoryItems.find((item) => item.name === saved.otc?.itemDispensed);
    if (match && !selectedMedicineId) setSelectedMedicineId(match._id);
  }, [inventoryItems, saved.otc?.itemDispensed, selectedMedicineId]);

  function nursingAssessmentPayload() {
    return {
      physicalExam: physicalOn ? summary(fields, examKeys) : "",
      laboratoryExamination: labOn ? summary(fields, labKeys) : "",
      notes: handoffNotes,
      physicalExamIncluded: physicalOn,
      laboratoryExamIncluded: labOn,
      fields,
    };
  }

  function buildPayload() {
    const medicineQuantity = quantity && selectedMedicine?.unit ? `${quantity} ${selectedMedicine.unit}` : quantity;
    const visitType = CLINICAL_VISIT_TYPE[entry.serviceType] || "Walk-in Medical Consultation";
    return {
      queueEntryId: entry._id,
      visitType,
      subjective,
      objective,
      assessment,
      plan,
      intakeFields: entry.medicalWorkflow?.initialFields || {},
      nursingAssessment: nursingAssessmentPayload(),
      medicineName: selectedMedicine?.name || saved.otc?.itemDispensed || "",
      quantity: medicineQuantity,
      otcInstructions: instructions,
      otc: { ...(saved.otc || {}), itemDispensed: selectedMedicine?.name || saved.otc?.itemDispensed || "", quantity: medicineQuantity, instructions },
      firstAid: saved.firstAid || {},
      safetyChecklist: saved.safetyChecklist || {},
      sessionNotes: saved.sessionNotes || "",
      natureOfInquiry: saved.natureOfInquiry || "",
      inquiryResponse: saved.inquiryResponse || "",
      secondaryVitals: {
        bloodPressure: entry.linkedVitals?.bloodPressure || "",
        pulseRate: entry.linkedVitals?.pulseRate ?? "",
        spo2: entry.linkedVitals?.spo2 ?? "",
      },
    };
  }

  async function handleSaveDraft() {
    setSaving(true); setError(""); setSyncMessage("");
    try {
      await saveConsultationDraft(entry._id, buildPayload());
      setSyncMessage("Draft synced to Full EMR · Medical Profile.");
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Draft could not be synced. Your entries remain here; please try again.");
    } finally { setSaving(false); }
  }

  async function handleComplete() {
    setSaving(true); setError(""); setSyncMessage("");
    try {
      const { queueEntry } = await completeSession(buildPayload());
      onCompleted(queueEntry);
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Could not save this session to the patient's EMR. Nothing was marked complete; review the required fields and try again.");
    } finally { setSaving(false); }
  }

  return <div className="active-session-overlay" onMouseDown={onClose}>
    <section className="active-session-modal" onMouseDown={(event) => event.stopPropagation()} aria-label="New Medical Record provider consultation" role="dialog" aria-modal="true">
      <header className="active-session-header"><span>New Medical Record · {entry.queueNumber || "Patient"}</span><button className="active-session-close" onClick={onClose} aria-label="Close">×</button></header>
      <div className="active-session-body">
        <div className="record-summary"><div><h2>{student.lastName}, {student.firstName}</h2><p>Student ID: {student.studentId || "—"}</p><p>Department: {student.program || student.department || "—"}</p><p>Official Email: {student.email || "—"}</p></div><div><p>Date of Examination: {new Date().toLocaleString()}</p><p>Service: {entry.medicalWorkflow?.purpose || entry.serviceType}</p><p>Assigned Provider: {providerTarget(entry.serviceType)}</p></div></div>

        <section className="record-section"><h2>Physical Examination</h2><label className="record-toggle"><input type="checkbox" checked={physicalOn} onChange={(event) => setPhysicalOn(event.target.checked)} /><span>{physicalOn ? "On" : "Off"}</span> Physical Examination</label>{physicalOn && <div className="exam-grid"><label>Blood Pressure<div className="bp-fields"><input className="text-input" inputMode="numeric" value={fields.blood_pressure_systolic || ""} onChange={(event) => setFields((current) => ({ ...current, blood_pressure_systolic: event.target.value }))} placeholder="Systolic" /><input className="text-input" inputMode="numeric" value={fields.blood_pressure_diastolic || ""} onChange={(event) => setFields((current) => ({ ...current, blood_pressure_diastolic: event.target.value }))} placeholder="Diastolic" /></div></label>{EXAM_FIELDS.map((label) => <label key={label}>{label}<input className="text-input" value={fields[keyFor(label)] || ""} onChange={(event) => setFields((current) => ({ ...current, [keyFor(label)]: event.target.value }))} /></label>)}<label className="exam-wide">Other Pertinent Findings<textarea className="text-input" rows={3} value={fields.physical_other_findings || ""} onChange={(event) => setFields((current) => ({ ...current, physical_other_findings: event.target.value }))} /></label></div>}</section>

        <section className="record-section"><h2>Laboratory Examination</h2><label className="record-toggle"><input type="checkbox" checked={labOn} onChange={(event) => setLabOn(event.target.checked)} /><span>{labOn ? "On" : "Off"}</span> Laboratory Examination</label>{labOn && <div className="exam-grid lab-grid"><fieldset><legend>Chest X-Ray</legend>{["Normal", "For Repeated Chest X-Ray"].map((value) => <label key={value}><input type="radio" name="provider-chest-xray" checked={fields.chest_xray === value} onChange={() => setFields((current) => ({ ...current, chest_xray: value }))} /> {value}</label>)}</fieldset><label className="exam-wide">Significant Findings<textarea className="text-input" rows={2} value={fields.lab_significant_findings || ""} onChange={(event) => setFields((current) => ({ ...current, lab_significant_findings: event.target.value }))} /></label><fieldset><legend>Cardio Clearance</legend>{["Cleared", "With Significant Findings"].map((value) => <label key={value}><input type="radio" name="provider-cardio" checked={fields.cardio_clearance === value} onChange={() => setFields((current) => ({ ...current, cardio_clearance: value }))} /> {value}</label>)}</fieldset><label className="exam-wide">Remarks<textarea className="text-input" rows={2} value={fields.lab_remarks || ""} onChange={(event) => setFields((current) => ({ ...current, lab_remarks: event.target.value }))} /></label></div>}</section>

        <section className="record-section"><h2>Nursing Notes / Handoff</h2><textarea className="text-input" rows={4} value={handoffNotes} onChange={(event) => setHandoffNotes(event.target.value)} placeholder="Add nursing observations or handoff notes" /></section>

        <section className="record-section"><h2>Medical Result</h2><div className="result-fields"><label>Patient Complaint<textarea className="text-input" rows={2} value={subjective} onChange={(event) => setSubjective(event.target.value)} /></label><label>Findings<textarea className="text-input" rows={2} value={objective} onChange={(event) => setObjective(event.target.value)} /></label><label>Diagnosis<textarea className="text-input" rows={2} value={assessment} onChange={(event) => setAssessment(event.target.value)} /></label><label>Treatment / Remarks<textarea className="text-input" rows={2} value={plan} onChange={(event) => setPlan(event.target.value)} /></label><label>Medicine Issued<select className="text-input" value={selectedMedicineId} onChange={(event) => { setSelectedMedicineId(event.target.value); setQuantity(""); }}><option value="">{inventoryLoading ? "Loading inventory…" : "Select medicine"}</option>{inventoryItems.map((item) => <option key={item._id} value={item._id} disabled={isInventoryItemUnavailable(item)}>{inventoryItemLabel(item)}</option>)}</select>{inventoryError && <small className="error-text">{inventoryError}</small>}</label><label>Quantity{selectedMedicine?.unit ? ` (${selectedMedicine.unit})` : ""}<input className="text-input" type="number" min="1" max={selectedMedicine?.quantity || undefined} value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!selectedMedicine || isInventoryItemUnavailable(selectedMedicine)} /></label><label className="exam-wide">Dosage / Instructions<textarea className="text-input" rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label></div></section>

        {error && <p className="error-text" role="alert">{error}</p>}
        {syncMessage && <p role="status" className="field-hint">{syncMessage}</p>}
        {(!assessment.trim() || !plan.trim()) && <p className="field-hint">Enter the diagnosis and treatment or remarks before completing this consultation.</p>}
        <div className="active-session-actions"><button className="btn btn-outline" onClick={handleSaveDraft} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button><button className="btn btn-primary" onClick={handleComplete} disabled={saving || !assessment.trim() || !plan.trim()}>{saving ? "Saving…" : "Mark Encounter Complete"}</button></div>
      </div>
    </section>
  </div>;
}
