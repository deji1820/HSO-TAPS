import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getClearanceRequirements, getStudents, saveMedicalProfile } from "../services/api.js";
import useMedicineInventory, { inventoryItemLabel, isInventoryItemUnavailable } from "../hooks/useMedicineInventory.js";
import "../styles/pages/NewMedicalRecord.css";

const PURPOSES = ["Medical Consultation", "Dental Consultation", "Prescription & Medicine", "Medical Clearance"];
const EXAM_FIELDS = ["Height (cm)", "Weight (kg)", "Abdomen", "Ears", "Eyes, Pupils", "Heart", "Lungs", "Nose", "Skin", "Thorax", "Extremities", "Deformities"];
function fieldKey(label) { return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function patientAffiliation(person) {
  return person?.affiliation || person?.occupation || person?.patientType || person?.userType || (person?.employeeId ? "Employee" : "Student");
}

function Section({ title, children }) { return <section className="record-section"><h2>{title}</h2>{children}</section>; }

export default function NewMedicalRecordPage() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [student, setStudent] = useState(null);
  const [purpose, setPurpose] = useState("");
  const [clearancePurpose, setClearancePurpose] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [physicalOn, setPhysicalOn] = useState(false);
  const [labOn, setLabOn] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [clearanceRequirements, setClearanceRequirements] = useState([]);
  const [clearanceRequirementsLoading, setClearanceRequirementsLoading] = useState(true);
  const [clearanceRequirementsError, setClearanceRequirementsError] = useState("");
  const recordFieldsRef = useRef(null);
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const { inventoryItems, inventoryLoading, inventoryError } = useMedicineInventory();
  const clearanceAffiliation = patientAffiliation(student) === "Employee" ? "Employee" : "Student";
  const clearancePurposes = clearanceRequirements.filter((item) => item.clearance && item.affiliation === clearanceAffiliation);
  const selectedClearance = clearancePurposes.find((item) => item.purpose === clearancePurpose);

  useEffect(() => {
    let active = true;
    getClearanceRequirements()
      .then(({ items = [] }) => { if (active) setClearanceRequirements(items); })
      .catch(() => { if (active) setClearanceRequirementsError("The HSO requirements list is unavailable. Try again before recording this clearance."); })
      .finally(() => { if (active) setClearanceRequirementsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || student) { setMatches([]); return undefined; }
    const timer = setTimeout(() => getStudents(query).then(setMatches).catch(() => setMatches([])), 250);
    return () => clearTimeout(timer);
  }, [query, student]);

  function proceed() {
    if (!student || !purpose) return;
    setShowForm(true);
  }

  async function saveRecord() {
    const fields = {};
    recordFieldsRef.current?.querySelectorAll("[name]").forEach((field) => {
      if ((field.type === "radio" || field.type === "checkbox") && !field.checked) return;
      fields[field.name] = field.value;
    });
    setSaving(true);
    setSaveError("");
    try {
      await saveMedicalProfile(student._id, { purpose, provider: user.name || "", physicalExamIncluded: physicalOn, laboratoryExamIncluded: labOn, fields, examinedAt: new Date().toISOString() });
      setSaveNotice(true);
    } catch {
      setSaveError("Could not save this medical profile. Check the server connection and try again.");
    } finally { setSaving(false); }
  }

  return <main className="new-record-page">
    <header className="new-record-heading"><h1>New Medical Record</h1><Link to="/dashboard">⌂ &gt;&gt; Dashboard</Link></header>
    {!showForm ? <Section title="Patient and Visit Details">
      <div className="new-record-grid">
        <label>Patient Name<input className="text-input" value={student ? `${student.firstName} ${student.lastName}` : query} onChange={(event) => { setStudent(null); setQuery(event.target.value); }} placeholder="Search student name or ID" /></label>
        <label>Patient Type<select className="text-input" value={student ? clearanceAffiliation : "Student"} disabled><option>Student</option><option>Employee</option></select></label>
        {matches.length > 0 && <div className="student-suggestions">{matches.map((candidate) => <button type="button" key={candidate._id} onClick={() => { setStudent(candidate); setQuery(`${candidate.firstName} ${candidate.lastName}`); setMatches([]); }}>{candidate.firstName} {candidate.lastName} <small>({candidate.studentId})</small></button>)}</div>}
        <label>Purpose<select className="text-input" value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value="">Select purpose</option>{PURPOSES.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="record-footer-actions"><Link className="btn btn-outline" to="/dashboard">&lt;&lt; Back</Link><button className="btn btn-primary" onClick={proceed} disabled={!student || !purpose}>Proceed &gt;&gt;</button></div>
      {!student && query.length > 1 && matches.length === 0 && <p className="record-hint">Choose a matching student from the search results to continue.</p>}
    </Section> : <>
      <div className="record-summary"><div><h2>&lt;{student.lastName}, {student.firstName}&gt;</h2><p>Patient Type: {clearanceAffiliation}</p><p>Department: {student.department || student.program || "—"}</p><p>Official Email: {student.email || "—"}</p></div><div><p>Date of Examination: {new Date().toLocaleString()}</p><p>Physician/Nurse: {user.name || "—"}</p><label>Purpose<textarea className="text-input" value={purpose} readOnly rows={2} /></label></div></div>
      <div ref={recordFieldsRef}>
      <div className="record-top-actions"><button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>&lt;&lt; Back</button><button type="button" className="btn btn-warning" onClick={() => { setPhysicalOn(false); setLabOn(false); }}>↻ Reset Form</button></div>

      {purpose === "Medical Clearance" ? <Section title="Medical Clearance"><label className="field-label" htmlFor="clearance-affiliation">Affiliation</label><select id="clearance-affiliation" className="text-input" name="clearance_affiliation" value={clearanceAffiliation} disabled aria-label="Affiliation from patient profile"><option>Student</option><option>Employee</option></select><label className="field-label" htmlFor="clearance-purpose">Clearance purpose</label><select id="clearance-purpose" className="text-input" name="clearance_purpose" value={clearancePurpose} disabled={clearanceRequirementsLoading || Boolean(clearanceRequirementsError)} onChange={(event) => setClearancePurpose(event.target.value)}><option value="">Select the reason for submitting</option>{clearancePurposes.map((item) => <option key={item.purpose}>{item.purpose}</option>)}</select><p className="record-hint">Requirements come from the HSO system notes and match the kiosk and document submission flows.</p>{clearanceRequirementsLoading ? <p className="required-documents" role="status">Loading requirements…</p> : clearanceRequirementsError ? <p className="error-text" role="alert">{clearanceRequirementsError}</p> : selectedClearance ? <div className="required-documents"><h3>Requirements for {selectedClearance.purpose}</h3><ul>{selectedClearance.requirements.map((item) => <li key={item.text}><strong>{item.kind === "document" && item.required ? "Required document: " : item.kind === "action" ? "Next step: " : "When applicable: "}</strong>{item.text}</li>)}</ul></div> : <p className="required-documents">Select a clearance purpose to view its requirements.</p>}</Section> : <>
        <Section title="Physical Examination"><label className="record-toggle"><input type="checkbox" checked={physicalOn} onChange={(event) => setPhysicalOn(event.target.checked)} /> Physical Examination <span>{physicalOn ? "On" : "Off"}</span></label>{physicalOn && <div className="exam-grid"><label>Blood Pressure<div className="bp-fields"><input name="blood_pressure_systolic" className="text-input" placeholder="Systolic" /><input name="blood_pressure_diastolic" className="text-input" placeholder="Diastolic" /></div></label>{EXAM_FIELDS.map((field) => <label key={field}>{field}<input name={fieldKey(field)} className="text-input" /></label>)}<label className="exam-wide">Other Pertinent Findings<textarea name="physical_other_findings" className="text-input" rows={3} /></label></div>}</Section>
        <Section title="Laboratory Examination"><label className="record-toggle"><input type="checkbox" checked={labOn} onChange={(event) => setLabOn(event.target.checked)} /> Laboratory Examination <span>{labOn ? "On" : "Off"}</span></label>{labOn && <div className="exam-grid lab-grid"><fieldset><legend>Chest X-Ray</legend><label><input type="radio" name="chest_xray" value="Normal" /> Normal</label><label><input type="radio" name="chest_xray" value="For Repeated Chest X-Ray" /> For Repeated Chest X-Ray</label></fieldset><label className="exam-wide">Significant Findings<textarea name="lab_significant_findings" className="text-input" rows={2} /></label><fieldset><legend>Cardio Clearance</legend><label><input type="radio" name="cardio_clearance" value="Cleared" /> Cleared</label><label><input type="radio" name="cardio_clearance" value="With Significant Findings" /> With Significant Findings</label></fieldset><label className="exam-wide">Remarks<textarea name="lab_remarks" className="text-input" rows={2} /></label></div>}</Section>
        <Section title="Medical Result"><div className="result-fields"><label>Findings<input name="medical_findings" className="text-input" /></label><label>Diagnosis<select name="diagnosis" className="text-input"><option value="">Select diagnosis</option><option>Pending assessment</option></select></label><label>Treatment / Remarks<textarea name="treatment_remarks" className="text-input" rows={2} /></label><label>Medicine Issued<select name="medicine_issued" className="text-input"><option value="">{inventoryLoading ? "Loading inventory…" : "Select medicine"}</option>{inventoryItems.map((item) => <option key={item._id} value={item.name} disabled={isInventoryItemUnavailable(item)}>{inventoryItemLabel(item)}</option>)}</select>{inventoryError && <small className="error-text">{inventoryError}</small>}{!inventoryLoading && !inventoryItems.length && <small className="record-hint">No active inventory items are available.</small>}</label></div></Section>
      </>}
      </div>
      {saveNotice && <p className="record-save-notice" role="status">Medical profile saved. It will appear in this student's EMR history.</p>}
      {saveError && <p className="error-text" role="alert">{saveError}</p>}
      <div className="record-footer-actions"><Link className="btn btn-primary" to={`/emr?studentId=${student.studentId}`}>Full EMR</Link><Link className="btn btn-danger" to="/dashboard">Cancel</Link><button type="button" className="btn btn-success" onClick={saveRecord} disabled={saving || (purpose === "Medical Clearance" && (!selectedClearance || clearanceRequirementsLoading || Boolean(clearanceRequirementsError)))}>{saving ? "Saving…" : "Save"}</button></div>
    </>}
  </main>;
}
