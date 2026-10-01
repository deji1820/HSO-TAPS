import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getStudents, getFullEmr, getSyncLog, getMedicalProfiles, getPatientHistory, savePatientHistory, getMedicalDocumentFile } from "../services/api.js";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/EMR.css";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function patientType(student) {
  return student?.occupation || student?.patientType || student?.userType || "Student";
}

function patientDepartment(student) {
  return student?.department || student?.program || "—";
}

function patientEmail(student) {
  return student?.officialEmail || student?.email || "—";
}

function VitalsTab({ vitals }) {
  if (!vitals?.length) return <div className="table-empty">No vitals recorded yet.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Temp (°C)</th>
            <th>Height (cm)</th>
            <th>Weight (kg)</th>
            <th>BMI</th>
            <th>Category</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {vitals.map((v) => (
            <tr key={v._id}>
              <td>{formatDate(v.capturedAt)}</td>
              <td>
                {v.temperatureC ?? "—"}
                {v.isFeverFlagged && <span className="badge badge-high" style={{ marginLeft: 6 }}>Fever</span>}
              </td>
              <td>{v.heightCm ?? "—"}</td>
              <td>{v.weightKg ?? "—"}</td>
              <td>{v.bmi ?? "—"}</td>
              <td>{v.bmiCategory ?? "—"}</td>
              <td>{v.source === "kiosk" ? "Kiosk Intake" : "Staff Entry"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One row of the Consultation History accordion.
function ConsultationEntry({ c, expanded, onToggle }) {
  const v = c.vitalsSnapshot || {};
  const hasKioskVitals = v.temperatureC != null || v.heightCm != null || v.weightKg != null;
  const hasSecondaryVitals = v.bloodPressure || v.pulseRate != null || v.spo2 != null;

  return (
    <div className="consultation-entry">
      <button className="consultation-entry-header" onClick={onToggle}>
        <span className={"consultation-caret" + (expanded ? " open" : "")}>▶</span>
        <span className="consultation-entry-date">Visit Date: {formatDate(c.visitDate)}</span>
        <span className="consultation-entry-type">Type: {c.visitType}</span>
        <span className="consultation-entry-staff">Attending: {c.attendingStaff?.name || "—"}</span>
      </button>

      {expanded && (
        <ul className="consultation-entry-body">
          {hasKioskVitals && (
            <li>
              Kiosk Intake Vitals: Temp: {v.temperatureC ?? "—"}°C
              {v.isFeverFlagged ? " (Fever Flagged)" : ""} | Height: {v.heightCm ?? "—"} cm | Weight: {v.weightKg ?? "—"} kg | BMI: {v.bmi ?? "—"} {v.bmiCategory ? `(${v.bmiCategory})` : ""}
            </li>
          )}
          {hasSecondaryVitals && (
            <li>
              Secondary Vitals: BP: {v.bloodPressure || "None"} | Pulse Rate: {v.pulseRate ?? "None"} | SpO2: {v.spo2 ?? "None"}
            </li>
          )}

          {c.visitType === "General Inquiry" ? (
            <>
              {c.natureOfInquiry && <li>Inquiry: {c.natureOfInquiry}</li>}
              {c.inquiryResponse && <li>Response: {c.inquiryResponse}</li>}
            </>
          ) : c.visitType === "Medication and Relief" ? (
            <>
              {c.otc?.itemDispensed && (
                <li>Dispensed: {c.otc.itemDispensed} ({c.otc.quantity}) — {c.otc.instructions}</li>
              )}
              {c.firstAid?.careProvided && (
                <li>First Aid: {c.firstAid.careProvided} — applied to {c.firstAid.appliedTo}, rest: {c.firstAid.restRequired}</li>
              )}
              {c.sessionNotes && <li>Notes: {c.sessionNotes}</li>}
            </>
          ) : (
            <>
              {c.subjective && <li>Subjective (S): {c.subjective}</li>}
              {c.objective && <li>Objective (O): {c.objective}</li>}
              {c.assessment && <li>Assessment (A): {c.assessment}</li>}
              {c.plan && <li>Plan &amp; Management (P): {c.plan}</li>}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function ConsultationsTab({ consultations }) {
  // Newest visit starts expanded; everything else starts collapsed.
  const [openId, setOpenId] = useState(consultations?.[0]?._id ?? null);

  if (!consultations?.length) return <div className="table-empty">No consultation records yet.</div>;
  return (
    <div className="consultation-list card">
      {consultations.map((c) => (
        <ConsultationEntry
          key={c._id}
          c={c}
          expanded={openId === c._id}
          onToggle={() => setOpenId((id) => (id === c._id ? null : c._id))}
        />
      ))}
    </div>
  );
}

function DocumentsTab({ documents }) {
  if (!documents?.length) return <div className="table-empty">No external documents synced yet.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Document Title</th>
            <th>Form Source</th>
            <th>Date Submitted</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d._id}>
              <td>{d.documentTitle}</td>
              <td>{d.formSource}</td>
              <td>{formatDate(d.submittedAt)}</td>
              <td>
                <span className={"badge " + (d.status === "Verified" ? "badge-routine" : d.status === "Rejected" ? "badge-high" : "badge-standard")}>
                  {d.status}
                </span>
              </td>
              <td>{d.fileUrl ? (d.name ? <button type="button" className="btn btn-outline btn-sm" onClick={async () => { try { const blob = await getMedicalDocumentFile(d._id); const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch { window.alert("Could not retrieve this document from the server."); } }}>View</button> : <a href={d.fileUrl} target="_blank" rel="noreferrer">View</a>) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileValue({ label, value }) {
  return <div className="emr-profile-field"><span>{label}</span><div>{value || "—"}</div></div>;
}

const OMIT_FORM_FIELDS = new Set(["studentid", "documenttitle", "fileurl", "submittedat"]);
function flattenFormPayload(payload, prefix = "") {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload).flatMap(([key, value]) => {
    if (OMIT_FORM_FIELDS.has(key.toLowerCase())) return [];
    const label = prefix ? `${prefix} / ${key}` : key;
    if (value == null || value === "") return [];
    if (Array.isArray(value)) return [[label, value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ")]];
    if (typeof value === "object") return flattenFormPayload(value, label);
    return [[label, String(value)]];
  });
}

function HealthStatusDeclarationTab({ submissions, documents }) {
  return <div className="emr-health-declaration">
    <h2 className="section-title">Health Status Declaration</h2>
    {submissions.length ? submissions.map((submission) => {
      const answers = flattenFormPayload(submission.rawPayload || {}).filter(([label]) => !/^(id|response id|responder email)$/i.test(label));
      return <article className="emr-health-submission" key={submission._id}>
        <header><strong>Submitted {formatDate(submission.createdAt)}</strong><span>{submission.rawPayload?.responderName || submission.rawPayload?.name || "Health Status Declaration"}</span></header>
        {answers.length ? <dl>{answers.map(([question, answer]) => <div key={question}><dt>{question.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ")}</dt><dd>{answer}</dd></div>)}</dl> : <p>No declaration answers were included in this submission.</p>}
      </article>;
    }) : <div className="table-empty">No Health Status Declaration responses have been synced for this patient.</div>}
    {documents?.length > 0 && <><h2 className="section-title">Attached Medical Forms</h2><DocumentsTab documents={documents} /></>}
  </div>;
}

function MedicalDocumentSubmissions({ files }) {
  if (!files.length) return <div className="table-empty">No documents have been submitted for this patient.</div>;
  return <div className="table-wrap"><table className="data-table">
    <thead><tr><th>Category</th><th>Document</th><th>Date Submitted</th><th>File Name</th></tr></thead>
    <tbody>{files.map((file) => <tr key={file.id}><td>{file.category || "—"}</td><td>{file.title || "—"}</td><td>{formatDate(file.date)}</td><td>{file.name || "—"}</td></tr>)}</tbody>
  </table></div>;
}

function MedicalProfileSections({ entry, vitals = [] }) {
  const fields = entry?.fields || {};
  const latestVitals = vitals[0] || {};
  return <div className="emr-profile-sections">
    <section className="emr-profile-section">
      <h3>Physical Examination</h3>
      <div className="emr-physical-layout">
        <div className="emr-profile-fields">
          <ProfileValue label="Blood Pressure (mmHg)" value={fields.blood_pressure_systolic || fields.blood_pressure_diastolic ? `${fields.blood_pressure_systolic || "—"} / ${fields.blood_pressure_diastolic || "—"}` : latestVitals.bloodPressure} />
          {["height_cm", "weight_kg", "abdomen", "ears", "eyes_pupils", "heart", "lungs", "nose", "skin", "thorax", "extremities", "deformities"].map((key) => <ProfileValue key={key} label={key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} value={fields[key] || (key === "height_cm" ? latestVitals.heightCm : key === "weight_kg" ? latestVitals.weightKg : "")} />)}
        </div>
        <div className="emr-profile-aside">
          <div className="emr-kiosk-intake"><strong>Kiosk Intake:</strong><span>{latestVitals.temperatureC != null ? `${latestVitals.temperatureC}°C` : "—"} · last captured at {latestVitals.capturedAt ? formatDate(latestVitals.capturedAt) : "—"}</span></div>
          <ProfileValue label="BP Status" value={latestVitals.bloodPressureStatus || latestVitals.bloodPressureClassification} />
          <ProfileValue label="BMI / Classification" value={latestVitals.bmi != null ? `${latestVitals.bmi} · ${latestVitals.bmiCategory || "Unclassified"}` : ""} />
          <ProfileValue label="Other Pertinent Findings" value={fields.physical_other_findings} />
        </div>
      </div>
    </section>
    <section className="emr-profile-section">
      <h3>Laboratory Examination</h3>
      <div className="emr-profile-fields emr-lab-fields">
        <ProfileValue label="Chest X-Ray" value={fields.chest_xray} />
        <ProfileValue label="Significant Findings" value={fields.lab_significant_findings} />
        <ProfileValue label="Cardio Clearance" value={fields.cardio_clearance} />
        <ProfileValue label="Remarks" value={fields.lab_remarks} />
      </div>
    </section>
    <section className="emr-profile-section">
      <h3>Medical Results</h3>
      <div className="emr-profile-fields emr-result-fields">
        <ProfileValue label="Findings" value={fields.medical_findings} />
        <ProfileValue label="Diagnosis" value={fields.diagnosis} />
        <ProfileValue label="Treatment / Remarks" value={fields.treatment_remarks} />
        <ProfileValue label="Medicine Issued" value={fields.medicine_issued} />
      </div>
    </section>
  </div>;
}

function MedicalProfileHistory({ entries, vitals }) {
  const latest = entries[0];
  const previous = entries.slice(1);
  return <>
    <div className="emr-profile-meta">{latest ? <>Last examined: {new Date(latest.examinedAt).toLocaleString()} · {latest.purpose} · {latest.provider}</> : "No medical profile has been saved for this patient."}</div>
    <MedicalProfileSections entry={latest} vitals={vitals} />
    <h2 className="section-title emr-history-title">Previous Medical Profile History</h2>
    {previous.length ? <div className="emr-profile-previous">{previous.map((entry) => <details key={entry.id}>
      <summary>{new Date(entry.examinedAt).toLocaleString()} · {entry.purpose} · {entry.provider}</summary>
      <MedicalProfileSections entry={entry} />
    </details>)}</div> : <p className="emr-profile-empty-history">No previous medical profiles recorded.</p>}
  </>;
}

const FAMILY_HISTORY_CONDITIONS = ["Asthma", "Diabetes Mellitus", "Health Ailment", "Asthma", "Diabetes Mellitus", "Health Ailment"];

function FamilyHistoryTab({ value, onChange, editing, onToggleEdit }) {
  const answers = value?.answers || {};
  function setAnswer(index, key, answer) {
    onChange({ ...value, answers: { ...answers, [index]: { ...answers[index], [key]: answer } } });
  }
  return <section className="emr-family-history">
    <header className="emr-family-heading">
      <h2><span aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 19c0-3.4 2.5-5.5 6-5.5s6 2.1 6 5.5v1H2zm12.5.5v-.7c0-2-0.8-3.6-2.2-4.7 1-.7 2.2-1.1 3.7-1.1 3 0 5 1.8 5 4.7v1.8z"/></svg></span> Family Medical History</h2>
      <button className="btn btn-warning emr-edit-history" type="button" onClick={onToggleEdit}>{editing ? "Save History" : "✎ Edit History"}</button>
    </header>
    <table className="emr-family-table">
      <thead><tr><th>Family Medical History</th><th>Yes</th><th>No</th><th>Remarks</th></tr></thead>
      <tbody>
        {FAMILY_HISTORY_CONDITIONS.map((condition, index) => {
          const answer = answers[index] || {};
          return <tr key={`${condition}-${index}`}>
            <td>{condition}</td>
            {["yes", "no"].map((choice) => <td className="emr-family-choice" key={choice}><input type="radio" name={`family-${index}`} value={choice} checked={answer.choice === choice} disabled={!editing} onChange={() => setAnswer(index, "choice", choice)} aria-label={`${condition}: ${choice}`} /></td>)}
            <td><input className="emr-family-remarks" value={answer.remarks || ""} readOnly={!editing} onChange={(event) => setAnswer(index, "remarks", event.target.value)} aria-label={`${condition} remarks`} /></td>
          </tr>;
        })}
        <tr><td colSpan="3">Others:</td><td><textarea className="emr-family-remarks emr-family-other" value={value?.others || ""} readOnly={!editing} onChange={(event) => onChange({ ...value, others: event.target.value })} aria-label="Other family history" /></td></tr>
      </tbody>
    </table>
  </section>;
}

const MEDICAL_HISTORY_GROUPS = [
  ["Asthma", "Diabetes Mellitus", "Heart Ailment"],
  ["Hypertension", "Kidney Disease", "Tuberculosis"],
];
const MEDICAL_HISTORY_NOTES = [
  ["previousIllness", "History of Previous Illness / Surgical Operations"],
  ["gynecological", "Gynecological / Obstetrical"],
  ["allergy", "Allergy"],
  ["alcoholDrinker", "Alcohol Drinker"],
];

function MedicalHistoryTab({ value, onChange, editing, onToggleEdit }) {
  const answers = value?.answers || {};
  function setAnswer(index, choice) {
    onChange({ ...value, answers: { ...answers, [index]: choice } });
  }
  return <section className="emr-medical-history">
    <header className="emr-family-heading">
      <h2><span aria-hidden="true">▣</span> Medical History</h2>
      <button className="btn btn-warning emr-edit-history" type="button" onClick={onToggleEdit}>{editing ? "Save History" : "✎ Edit History"}</button>
    </header>
    <div className="emr-medical-history-tables">
      {MEDICAL_HISTORY_GROUPS.map((conditions, groupIndex) => <table className="emr-medical-history-table" key={groupIndex}>
        <thead><tr><th></th><th>Yes</th><th>No</th></tr></thead>
        <tbody>{conditions.map((condition, rowIndex) => {
          const answerIndex = `${groupIndex}-${rowIndex}`;
          return <tr key={condition}><td>{condition}</td>{["yes", "no"].map((choice) => <td className="emr-family-choice" key={choice}><input type="radio" name={`medical-history-${answerIndex}`} value={choice} checked={answers[answerIndex] === choice} disabled={!editing} onChange={() => setAnswer(answerIndex, choice)} aria-label={`${condition}: ${choice}`} /></td>)}</tr>;
        })}</tbody>
      </table>)}
    </div>
    <div className="emr-medical-history-notes">
      {MEDICAL_HISTORY_NOTES.map(([key, label]) => <label key={key}>{label}<input className="emr-history-note-input" value={value?.[key] || ""} readOnly={!editing} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>)}
    </div>
  </section>;
}

const TABS = [
  { key: "about", label: "About Patient", icon: "👤" },
  { key: "profile", label: "Medical Profile", icon: "🩺" },
  { key: "history", label: "Medical History", icon: "📄" },
  { key: "family", label: "Family History", icon: "👪" },
  { key: "forms", label: "Medical Forms", icon: "📝" },
  { key: "files", label: "Medical Files", icon: "📁" },
];

export default function EMRPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [record, setRecord] = useState(null);
  const [profileHistory, setProfileHistory] = useState([]);
  const [healthStatusSubmissions, setHealthStatusSubmissions] = useState([]);
  const [medicalDocumentFiles, setMedicalDocumentFiles] = useState([]);
  const [familyHistory, setFamilyHistory] = useState({ answers: {}, others: "" });
  const [editingFamilyHistory, setEditingFamilyHistory] = useState(false);
  const [medicalHistory, setMedicalHistory] = useState({ answers: {} });
  const [editingMedicalHistory, setEditingMedicalHistory] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [tab, setTab] = useState("about");
  const [error, setError] = useState(null);

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery || (selectedPatient && normalizedQuery === `${selectedPatient.firstName} ${selectedPatient.lastName}`.toLowerCase())) {
      setSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      getStudents(query.trim())
        .then((students) => setSuggestions(students.slice(0, 6)))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selectedPatient]);

  useEffect(() => {
    const studentId = new URLSearchParams(location.search).get("studentId");
    if (!studentId) return;
    setQuery(studentId);
    getStudents(studentId).then((students) => {
      const match = students.find((student) => student.studentId === studentId);
      if (match) openStudent(match._id);
      else setError("Could not find this student record.");
    }).catch(() => setError("Could not search students. Is the server running?"));
    // Search once when navigating from the dashboard with a student ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function handleSearch(e) {
    e.preventDefault();
    if (selectedPatient) {
      openStudent(selectedPatient._id);
      return;
    }
    setSearching(true);
    setSearched(true);
    setError(null);
    try {
      const students = await getStudents(query);
      setResults(students);
      if (students.length === 1) openStudent(students[0]._id);
    } catch {
      setError("Could not search students. Is the server running?");
    } finally {
      setSearching(false);
    }
  }

  async function openStudent(id) {
    setLoadingRecord(true);
    setError(null);
    setTab("about");
    try {
      const [full, profiles, histories] = await Promise.all([getFullEmr(id), getMedicalProfiles(id), getPatientHistory(id)]);
      setRecord(full);
      setProfileHistory(profiles.map((profile) => ({ ...profile, id: profile._id })));
      setMedicalDocumentFiles((full.documents || []).filter((file) => file.formSource === "Admin Portal").map((file) => ({ id: file._id, category: file.category, title: file.documentTitle, date: file.submittedAt, name: file.name })));
      try {
        const syncLog = await getSyncLog();
        const studentId = String(full.student._id);
        setHealthStatusSubmissions(syncLog.filter((submission) => {
          const matchedStudent = submission.matchedStudent?._id || submission.matchedStudent;
          const formTitle = `${submission.formName || ""} ${submission.rawPayload?.documentTitle || ""}`.toLowerCase();
          return String(matchedStudent) === studentId && /health status|declaration/.test(formTitle);
        }));
      } catch {
        setHealthStatusSubmissions([]);
      }
      setFamilyHistory(histories.familyHistory || { answers: {}, others: "" });
      setMedicalHistory(histories.medicalHistory || { answers: {} });
      setEditingFamilyHistory(false);
      setEditingMedicalHistory(false);
    } catch {
      setError("Could not load this student's record.");
    } finally {
      setLoadingRecord(false);
    }
  }

  async function toggleFamilyHistoryEdit() {
    if (editingFamilyHistory && record?.student?._id) {
      try { await savePatientHistory(record.student._id, { familyHistory, medicalHistory }); }
      catch { setError("Could not save patient history to the server."); return; }
    }
    setEditingFamilyHistory((editing) => !editing);
  }

  async function toggleMedicalHistoryEdit() {
    if (editingMedicalHistory && record?.student?._id) {
      try { await savePatientHistory(record.student._id, { familyHistory, medicalHistory }); }
      catch { setError("Could not save patient history to the server."); return; }
    }
    setEditingMedicalHistory((editing) => !editing);
  }

  return (
    <div>
      {!record && <>
      <div className="page-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" strokeLinejoin="round" />
        </svg>
        <h1>Electronic Medical Records</h1>
      </div>

      <form onSubmit={handleSearch} className="emr-search-form">
        <label className="emr-field-label" htmlFor="emr-patient-name">Patient Name</label>
        <input
          id="emr-patient-name"
          className="text-input"
          type="search"
          placeholder="Search Student / Employee Name ..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedPatient(null); }}
        />
        {suggestions.length > 0 && (
          <div className="emr-patient-suggestions" role="listbox" aria-label="Matching patients">
            {suggestions.map((student) => (
              <button type="button" key={student._id} role="option" onClick={() => {
                setSelectedPatient(student);
                setQuery(`${student.firstName} ${student.lastName}`);
                setSuggestions([]);
              }}>
                {student.firstName} {student.lastName} <small>{student.studentId}</small>
              </button>
            ))}
          </div>
        )}
        <label className="emr-field-label" htmlFor="emr-patient-type">Patient Type:</label>
        <input id="emr-patient-type" className="text-input" value={selectedPatient ? patientType(selectedPatient) : ""} placeholder="Auto-filled from patient" readOnly />
        <label className="emr-field-label" htmlFor="emr-department">Department:</label>
        <input id="emr-department" className="text-input" value={selectedPatient ? patientDepartment(selectedPatient) : ""} placeholder="Auto-filled from patient" readOnly />
        <label className="emr-field-label" htmlFor="emr-email">Official Email:</label>
        <input id="emr-email" className="text-input" value={selectedPatient ? patientEmail(selectedPatient) : ""} placeholder="Auto-filled from patient" readOnly />
        <div className="emr-search-actions">
          <button className="btn btn-success" type="submit" disabled={searching}>
            ↑ {searching ? "Searching…" : "Submit"}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate(-1)}>&lt;&lt; Back</button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      {searched && (
        <div className="emr-search-results" aria-live="polite">
          {results.length > 0 ? results.map((s) => (
            <button key={s._id} className="emr-search-result" onClick={() => openStudent(s._id)}>
              <span className="emr-search-result-name">{s.lastName}, {s.firstName}</span>
              <span>{s.studentId} · {s.program || "No department listed"}</span>
              <span className="emr-search-result-action">View record →</span>
            </button>
          )) : <p className="table-empty">No students match that search.</p>}
        </div>
      )}

      </>}

      {loadingRecord && <p className="page-subtitle" style={{ marginTop: 18 }}>Loading record…</p>}

      {!loadingRecord && record && (
        <div className="emr-detail-card">
          <div className="emr-full-heading">
            <h1>Patient Full EMR</h1>
            <p>▰ &gt;&gt; Electronic Medical Records</p>
          </div>
          <div className="emr-patient-summary">
            <div className="emr-summary-name">{record.student.lastName}, {record.student.firstName}</div>
            <div className="emr-summary-row"><span>Patient Type:</span><span>{patientType(record.student)}</span></div>
            <div className="emr-summary-row"><span>Department:</span><span>{patientDepartment(record.student)}</span></div>
            <div className="emr-summary-row"><span>Official Email:</span><span>{patientEmail(record.student)}</span></div>
            <button className="btn btn-primary btn-sm" onClick={() => setRecord(null)}>&lt;&lt; Back</button>
          </div>

          <hr className="emr-divider" />

          <div className="workstation-tabs emr-segmented-tabs">
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

          <div className="emr-tab-content">
            {tab === "about" && <div className="card patient-info-block"><h2>About Patient</h2><div className="patient-info-grid">
              <div><span className="field-label-inline">Name:</span> {record.student.lastName}, {record.student.firstName}</div>
              <div><span className="field-label-inline">Student ID:</span> {record.student.studentId}</div>
              <div><span className="field-label-inline">Patient Type:</span> {patientType(record.student)}</div>
              <div><span className="field-label-inline">Program / Department:</span> {patientDepartment(record.student)}</div>
              <div><span className="field-label-inline">Official Email:</span> {patientEmail(record.student)}</div>
              <div><span className="field-label-inline">Year Level:</span> {record.student.yearLevel || "—"}</div>
              <div><span className="field-label-inline">School Year:</span> {record.student.schoolYear || "—"}</div>
              <div><span className="field-label-inline">Age:</span> {record.student.age ?? "—"}</div>
              <div><span className="field-label-inline">Sex:</span> {record.student.sex || "—"}</div>
              <div><span className="field-label-inline">Guardian Contact:</span> {record.student.guardianContact || "—"}</div>
            </div><p className="page-subtitle">Profile data is sourced from the student master-data import.</p></div>}
            {tab === "profile" && <><MedicalProfileHistory entries={profileHistory} vitals={record.vitals || []} /><h2 className="section-title">Visit and Clinical History</h2><ConsultationsTab consultations={record.consultations} /></>}
            {tab === "history" && <MedicalHistoryTab value={medicalHistory} onChange={setMedicalHistory} editing={editingMedicalHistory} onToggleEdit={toggleMedicalHistoryEdit} />}
            {tab === "family" && <FamilyHistoryTab value={familyHistory} onChange={setFamilyHistory} editing={editingFamilyHistory} onToggleEdit={toggleFamilyHistoryEdit} />}
            {tab === "forms" && <HealthStatusDeclarationTab submissions={healthStatusSubmissions} documents={record.documents?.filter((document) => /health status|declaration|medical form/i.test(document.documentTitle || ""))} />}
            {tab === "files" && <><h2 className="section-title">Medical Document Submissions</h2><MedicalDocumentSubmissions files={medicalDocumentFiles} /><h2 className="section-title">Synced Medical Files</h2><DocumentsTab documents={record.documents} /></>}
          </div>
        </div>
      )}
    </div>
  );
}
