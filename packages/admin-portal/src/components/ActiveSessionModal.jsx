import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeSession } from "../services/api.js";
import useMedicineInventory, { inventoryItemLabel, isInventoryItemUnavailable } from "../hooks/useMedicineInventory.js";
import "../styles/components/ActiveSessionModal.css";

const PRIORITY_BADGE = {
  "High Priority": "badge-high",
  "Standard Priority": "badge-standard",
  "Routine Check": "badge-routine",
};

// Maps the queue entry's serviceType to the ConsultationRecord.visitType enum
// when the staff member saves from the Clinical Charting tab.
const CLINICAL_VISIT_TYPE = {
  "Medical Consultation": "Walk-in Medical Consultation",
  "Dental Consultation": "Dental Consultation",
  "Medical Clearance": "Medical Clearance",
};

const TABS = [
  { key: "clinical", label: "Clinical Charting", icon: "📄" },
  { key: "medication", label: "Medication & Relief", icon: "💊" },
  { key: "inquiry", label: "General Inquiry", icon: "ℹ️" },
];

function formatTimestamp(d) {
  if (!d) return null;
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function ActiveSessionModal({ entry, onClose, onCompleted }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("clinical");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Secondary vitals — staff-entered, not captured by the kiosk
  const [bloodPressure, setBloodPressure] = useState(entry.linkedVitals?.bloodPressure || "");
  const [pulseRate, setPulseRate] = useState(entry.linkedVitals?.pulseRate ?? "");
  const [spo2, setSpo2] = useState(entry.linkedVitals?.spo2 ?? "");

  // Clinical Charting
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");

  // Medication & Relief
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const { inventoryItems, inventoryLoading, inventoryError } = useMedicineInventory();
  const selectedMedicine = inventoryItems.find((item) => item._id === selectedMedicineId);
  const [quantity, setQuantity] = useState("");
  const [otcInstructions, setOtcInstructions] = useState("");
  const [careProvided, setCareProvided] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [restRequired, setRestRequired] = useState("");
  const [verifiedIdentityAndAllergies, setVerifiedIdentityAndAllergies] = useState(false);
  const [confirmedNoAdverseReactions, setConfirmedNoAdverseReactions] = useState(false);
  const [instructedDosageAndHygiene, setInstructedDosageAndHygiene] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  // General Inquiry
  const [natureOfInquiry, setNatureOfInquiry] = useState("");
  const [inquiryResponse, setInquiryResponse] = useState("");

  const student = entry.student || {};
  const vitals = entry.linkedVitals || {};
  const initialRecordFields = Object.entries(entry.medicalWorkflow?.initialFields || {}).filter(([key, value]) => !["diagnosis", "treatment", "treatment_remarks"].includes(key) && String(value ?? "").trim());

  async function handleComplete() {
    setSaving(true);
    setError(null);
    try {
      const visitType =
        tab === "medication"
          ? "Medication and Relief"
          : tab === "inquiry"
          ? "General Inquiry"
          : CLINICAL_VISIT_TYPE[entry.serviceType] || "Walk-in Medical Consultation";

      const payload = {
        queueEntryId: entry._id,
        visitType,
        secondaryVitals: {
          bloodPressure: bloodPressure || undefined,
          pulseRate: pulseRate === "" ? undefined : Number(pulseRate),
          spo2: spo2 === "" ? undefined : Number(spo2),
        },
      };

      if (tab === "clinical") {
        Object.assign(payload, { subjective, objective, assessment, plan });
      } else if (tab === "medication") {
        Object.assign(payload, {
          otc: { itemDispensed: selectedMedicine?.name || "", quantity: quantity && selectedMedicine?.unit ? `${quantity} ${selectedMedicine.unit}` : quantity, instructions: otcInstructions },
          firstAid: { careProvided, appliedTo, restRequired },
          safetyChecklist: {
            verifiedIdentityAndAllergies,
            confirmedNoAdverseReactions,
            instructedDosageAndHygiene,
          },
          sessionNotes,
        });
      } else {
        Object.assign(payload, { natureOfInquiry, inquiryResponse });
      }

      const { queueEntry } = await completeSession(payload);
      onCompleted(queueEntry);
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Could not save this session to the patient's EMR. Nothing was marked complete; review the required fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="active-session-overlay" onMouseDown={onClose}>
      <div className="active-session-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="active-session-header">
          <span>
            Active Session - {entry.queueNumber || "----"} &nbsp;|&nbsp;{" "}
            <span className={"active-session-priority"}>{entry.priorityLevel}</span>
          </span>
          <button className="active-session-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="active-session-body">
          <div className="card patient-info-block">
            <div className="patient-info-grid">
              <div><span className="field-label-inline">Name:</span> {student.lastName}, {student.firstName}</div>
              <div><span className="field-label-inline">Student ID:</span> {student.studentId}</div>
              <div><span className="field-label-inline">Program:</span> {student.program || "—"}</div>
              <div><span className="field-label-inline">Date of Birth:</span> {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : "—"}</div>
              <div><span className="field-label-inline">Sex:</span> {student.sex || "—"}</div>
              <div><span className="field-label-inline">Guardian's Contact:</span> {student.guardianContact || "—"}</div>
            </div>
            <div className="health-flags-row">
              <span className="field-label-inline">Health Flags:</span>
              {student.healthFlags?.length > 0 ? (
                student.healthFlags.map((f) => <span key={f} className="badge badge-high">{f}</span>)
              ) : (
                <span className="health-flags-empty" />
              )}
            </div>
          </div>

          <div className="vitals-columns">
            <div className="card">
              <h3 className="vitals-block-title">Kiosk Intake</h3>
              <div className="vitals-rows">
                <div className="vitals-row">
                  <span className="field-label-inline">Temperature:</span> {vitals.temperatureC ?? "—"}
                  {vitals.isFeverFlagged && <span className="badge badge-high" style={{ marginLeft: 6 }}>Fever</span>}
                  {formatTimestamp(vitals.capturedAt) && (
                    <span className="vitals-captured">Last captured {formatTimestamp(vitals.capturedAt)}</span>
                  )}
                </div>
                <div className="vitals-row"><span className="field-label-inline">Height:</span> {vitals.heightCm ?? "—"} cm</div>
                <div className="vitals-row"><span className="field-label-inline">Weight:</span> {vitals.weightKg ?? "—"} kg</div>
                <div className="vitals-row">
                  <span className="field-label-inline">BMI:</span> {vitals.bmi ?? "—"} {vitals.bmiCategory ? `(${vitals.bmiCategory})` : ""}
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="vitals-block-title">Secondary Vitals</h3>
              <div className="vitals-rows">
                <label className="vitals-input-row">
                  <span className="field-label-inline">Blood Pressure:</span>
                  <input className="text-input" value={bloodPressure} onChange={(e) => setBloodPressure(e.target.value)} placeholder="e.g. 110/70" />
                </label>
                <label className="vitals-input-row">
                  <span className="field-label-inline">Pulse Rate:</span>
                  <input className="text-input" type="number" value={pulseRate} onChange={(e) => setPulseRate(e.target.value)} placeholder="bpm" />
                </label>
                <label className="vitals-input-row">
                  <span className="field-label-inline">SpO2:</span>
                  <input className="text-input" type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="%" />
                </label>
              </div>
            </div>
          </div>

          {entry.medicalWorkflow && <section className="card" aria-label="New medical record intake"><h3 className="vitals-block-title">New Medical Record · Nurse Intake</h3><p>Purpose: {entry.medicalWorkflow.purpose}</p>{initialRecordFields.length ? <div className="patient-info-grid">{initialRecordFields.map(([key, value]) => <div key={key}><span className="field-label-inline">{key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}:</span> {String(value)}</div>)}</div> : <p>No additional intake findings were entered.</p>}</section>}

          {entry.nursingAssessment && <section className="card" aria-label="Nursing handoff"><h3 className="vitals-block-title">Nursing assessment and handoff</h3><div className="vitals-rows">{entry.nursingAssessment.physicalExam && <p><strong>Physical examination:</strong> {entry.nursingAssessment.physicalExam}</p>}{entry.nursingAssessment.laboratoryExamination && <p><strong>Laboratory examination:</strong> {entry.nursingAssessment.laboratoryExamination}</p>}{entry.nursingAssessment.notes && <p><strong>Nursing notes:</strong> {entry.nursingAssessment.notes}</p>}</div></section>}

          <h3 className="workstation-title">Workstation Tabs</h3>
          <div className="workstation-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={"workstation-tab" + (tab === t.key ? " active" : "")}
                onClick={() => setTab(t.key)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === "clinical" && (
            <div className="workstation-panel">
              <label className="field-label">Subjective (S) - Patient Complaint:</label>
              <textarea className="text-input" rows={2} value={subjective} onChange={(e) => setSubjective(e.target.value)} />
              <label className="field-label">Objective (O) - Physical Examination:</label>
              <textarea className="text-input" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} />
              <label className="field-label">Assessment (A) - Diagnosis:</label>
              <textarea className="text-input" rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} />
              <label className="field-label">Plan &amp; Management (P) - Instructions:</label>
              <textarea className="text-input" rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} />
            </div>
          )}

          {tab === "medication" && (
            <div className="workstation-panel medication-panel">
              <div>
                <h4 className="med-subheading">Over the Counter (OTC) Medicine:</h4>
                <label className="field-label" htmlFor="inventory-medicine">Item Dispensed:</label>
                <select id="inventory-medicine" className="text-input" value={selectedMedicineId} onChange={(e) => { setSelectedMedicineId(e.target.value); setQuantity(""); }}>
                  <option value="">{inventoryLoading ? "Loading inventory…" : "Select an inventory item"}</option>
                  {inventoryItems.map((item) => <option key={item._id} value={item._id} disabled={isInventoryItemUnavailable(item)}>{inventoryItemLabel(item)}</option>)}
                </select>
                {inventoryError && <p className="error-text">{inventoryError}</p>}
                {!inventoryLoading && !inventoryItems.length && <p className="field-hint">No active inventory items are available.</p>}
                <label className="field-label" htmlFor="medicine-quantity">Quantity{selectedMedicine?.unit ? ` (${selectedMedicine.unit})` : ""}</label>
                <input id="medicine-quantity" className="text-input" type="number" min="1" max={selectedMedicine?.quantity || undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!selectedMedicine || isInventoryItemUnavailable(selectedMedicine)} />
                <label className="field-label">Instructions:</label>
                <input className="text-input" value={otcInstructions} onChange={(e) => setOtcInstructions(e.target.value)} />

                <h4 className="med-subheading">First Aid and Immediate Care</h4>
                <label className="field-label">Care Provided:</label>
                <input className="text-input" value={careProvided} onChange={(e) => setCareProvided(e.target.value)} />
                <label className="field-label">Applied to:</label>
                <input className="text-input" value={appliedTo} onChange={(e) => setAppliedTo(e.target.value)} />
                <label className="field-label">Rest Required:</label>
                <input className="text-input" value={restRequired} onChange={(e) => setRestRequired(e.target.value)} />
              </div>

              <div>
                <h4 className="med-subheading">Safety and Dispensing Checklist</h4>
                <label className="checklist-item">
                  <input type="checkbox" checked={verifiedIdentityAndAllergies} onChange={(e) => setVerifiedIdentityAndAllergies(e.target.checked)} />
                  Verified student identity and checked allergy flags
                </label>
                <label className="checklist-item">
                  <input type="checkbox" checked={confirmedNoAdverseReactions} onChange={(e) => setConfirmedNoAdverseReactions(e.target.checked)} />
                  Confirmed no adverse reactions to applied first-aid materials or oral medicine
                </label>
                <label className="checklist-item">
                  <input type="checkbox" checked={instructedDosageAndHygiene} onChange={(e) => setInstructedDosageAndHygiene(e.target.checked)} />
                  Instructed student on proper dosage and wound care hygiene
                </label>

                <label className="field-label" style={{ marginTop: 14 }}>Session Notes / Remarks</label>
                <textarea className="text-input" rows={5} value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
              </div>
            </div>
          )}

          {tab === "inquiry" && (
            <div className="workstation-panel">
              <label className="field-label">Nature of Inquiry:</label>
              <input className="text-input" value={natureOfInquiry} onChange={(e) => setNatureOfInquiry(e.target.value)} />
              <label className="field-label">Inquiry Notes and Staff Response:</label>
              <textarea className="text-input" rows={3} value={inquiryResponse} onChange={(e) => setInquiryResponse(e.target.value)} />
            </div>
          )}

          {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
          {tab === "clinical" && (!assessment.trim() || !plan.trim()) && <p className="field-hint">Enter the diagnosis or clinical assessment and the treatment plan before completing this consultation.</p>}

          <div className="active-session-actions">
            <button className="btn btn-outline" onClick={() => navigate(`/emr?studentId=${student.studentId}`)}>
              View Full EMR
            </button>
            <button className="btn btn-primary" onClick={handleComplete} disabled={saving || (tab === "clinical" && (!assessment.trim() || !plan.trim()))}>
              {saving ? "Saving…" : "Complete and Save Session"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
