import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getStudents, getFullEmr, getMedicalProfiles, getPatientHistory, savePatientHistory, updateHealthDeclaration, updateMedicalDocumentStatus, updateMedicalProfile } from "../services/api.js";
import { openMedicalDocument } from "../utils/medicalDocuments.js";
import { normalizeRole } from "../utils/roles.js";
import VerifiedClearanceCertificate from "../components/VerifiedClearanceCertificate.jsx";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/EMR.css";
import { appDialog } from "../../../shared-ui/src/dialogService.js";

const EMR_RECORDS_PER_PAGE = 5;

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function isHealthStatusDeclaration(document) {
  return Boolean(document?.submissionDetails?.healthDeclaration) || /health status declaration/i.test(document?.documentTitle || "");
}

function patientType(student) {
  return student?.affiliation || student?.occupation || student?.patientType || student?.userType || "Student";
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
            <th>Blood Pressure</th>
            <th>Pulse</th>
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
                {v.temperatureStatus && <span className={"badge " + (v.temperatureStatus === "Normal" ? "badge-routine" : "badge-high")} style={{ marginLeft: 6 }}>{v.temperatureStatus}</span>}
              </td>
              <td>{v.bloodPressure || "—"}{v.bloodPressureClassification ? ` (${v.bloodPressureClassification})` : ""}</td>
              <td>{v.pulseRate ?? "—"}</td>
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
              Kiosk Intake Vital Signs: Temp: {v.temperatureC ?? "—"}°C
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
              {c.serviceType && <li>Service: {c.serviceType}</li>}
              {c.requestDetails && <li>Patient request: {c.requestDetails}</li>}
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

function ClearanceCertificateAction({ certificate, label = "View / Print Certificate" }) {
  const [open, setOpen] = useState(false);
  return certificate ? <><button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>{label}</button>{open && <VerifiedClearanceCertificate certificate={certificate} onClose={() => setOpen(false)} />}</> : null;
}

function MedicalClearanceForms({ workflows = [], documents = [] }) {
  if (!workflows.length) return <div className="table-empty">No medical clearances have been created for this patient.</div>;
  return <section className="medical-clearance-forms"><div className="emr-document-list">{workflows.map((workflow) => {
    const linkedDocuments = documents.filter((document) => String(document.clearanceWorkflow?._id || document.clearanceWorkflow) === String(workflow._id));
    const certificate = documents.find((document) => String(document.sourceWorkflow?._id || document.sourceWorkflow) === String(workflow._id)) || workflow.medicalFile;
    return <article className="emr-document-card" key={workflow._id}>
      <header><h3>{workflow.purpose}</h3><span>{formatDate(workflow.createdAt)}</span></header>
      <div className="emr-document-card-grid"><div><span>Status</span><strong>{workflow.status === "ready_for_approval" ? "Ready for nurse completion" : String(workflow.status || "Pending").replaceAll("_", " ")}</strong></div><div><span>Affiliation</span><strong>{workflow.affiliation || "—"}</strong></div><div><span>Completed</span><strong>{workflow.certificateIssuedAt ? formatDate(workflow.certificateIssuedAt) : "Not completed"}</strong></div></div>
      <p className="emr-document-review-remarks"><strong>Nurse assessment:</strong> {[workflow.assessment?.physicalExam, workflow.assessment?.laboratoryExamination, workflow.assessment?.notes].filter(Boolean).join(" · ") || "Not recorded"}</p>
      <details className="emr-document-details"><summary>Clearance requirements</summary><ul>{(workflow.requirements || []).map((requirement, index) => {
        const linkedId = requirement.document?._id || requirement.document;
        const submittedFile = linkedDocuments.find((document) => String(document._id) === String(linkedId)) || (linkedId ? documents.find((document) => String(document._id) === String(linkedId)) : null);
        return <li key={`${requirement.text}-${index}`}>{requirement.text}: {String(requirement.status || "pending").replaceAll("_", " ")}{submittedFile ? ` · ${submittedFile.name || submittedFile.documentTitle} (${submittedFile.status})` : requirement.evidence ? ` · ${requirement.evidence}` : ""}</li>;
      })}</ul></details>
      <h4>Documents submitted through this clearance</h4>
      {linkedDocuments.length ? <ul className="clearance-emr-submitted-files">{linkedDocuments.map((document) => <li key={document._id}><span><strong>{document.clearanceRequirementText || "Supporting document"}</strong><br />{document.name || document.documentTitle} · {document.status} · {formatDate(document.submittedAt)}</span>{document.name && <button type="button" className="btn btn-outline btn-sm" onClick={() => openMedicalDocument(document._id, document.name).catch((error) => appDialog.alert(error.message || "Could not open the submitted file."))}>View Submitted File</button>}</li>)}</ul> : <p>No supporting file has been uploaded for this clearance.</p>}
      {certificate && <div className="document-actions"><ClearanceCertificateAction certificate={certificate} /></div>}
    </article>;
  })}</div></section>;
}

function DocumentsTab({ documents, canReviewDocuments = false, updatingDocumentId, onStatusChange, emptyMessage = "No external documents synced yet." }) {
  if (!documents?.length) return <div className="table-empty">{emptyMessage}</div>;
  return <div className="emr-document-list">{documents.map((document) => <article className="emr-document-card" key={document._id}>
    <header><h3>{document.documentTitle || document.name || "Medical document"}</h3><span>{formatDate(document.submittedAt)}</span></header>
    <div className="emr-document-card-grid">
      <div><span>Form source</span><strong>{document.formSource || "—"}</strong></div>
      <div><span>Status</span>{canReviewDocuments && document.recordType !== "clearance_certificate" ? <select className="text-input document-status-select" aria-label={`Change status for ${document.documentTitle || document.name || "document"}`} value={document.status || "Pending"} disabled={updatingDocumentId === document._id || ["Verified", "Rejected", "Issued"].includes(document.status)} onChange={(event) => onStatusChange(document._id, event.target.value)}><option>Pending</option><option>Verified</option><option>Rejected</option></select> : <strong>{document.status || "Pending"}</strong>}</div>
    </div>
    {document.verificationRemarks && <p className="emr-document-review-remarks"><strong>Review remarks:</strong> {document.verificationRemarks}</p>}
    {document.submissionDetails?.clearance?.approval && <p className="emr-document-review-remarks"><strong>Approved by:</strong> {document.submissionDetails.clearance.approval.providerName} · {document.submissionDetails.clearance.approval.providerRole}. {document.submissionDetails.clearance.approval.providerStatement}</p>}
    {document.verificationHistory?.length > 0 && <details className="emr-document-details"><summary>Review history</summary><ul>{document.verificationHistory.map((event, index) => <li key={`${event.at || index}-${index}`}>{event.status} · {formatDate(event.at)}{event.actor?.name ? ` · ${event.actor.name}` : ""}{event.remarks ? ` — ${event.remarks}` : ""}</li>)}</ul></details>}
    {document.submissionDetails?.clearance?.requirements?.length > 0 && <details className="emr-document-details"><summary>Verified clearance requirements</summary><ul>{document.submissionDetails.clearance.requirements.map((requirement, index) => <li key={`${requirement.text}-${index}`}>{requirement.text}: {requirement.status?.replaceAll("_", " ")}{requirement.evidence ? ` — ${requirement.evidence}` : ""}</li>)}</ul></details>}
    <div className="document-actions">{document.recordType === "clearance_certificate" ? <ClearanceCertificateAction certificate={document} /> : document.fileUrl ? document.name ? <><button type="button" className="btn btn-outline btn-sm" onClick={() => openMedicalDocument(document._id, document.name).catch((error) => appDialog.alert(error.message || "Could not open this document."))}>View</button><button type="button" className="btn btn-primary btn-sm" onClick={() => openMedicalDocument(document._id, document.name, { print: true }).catch((error) => appDialog.alert(error.message || "Could not print this document."))}>Print</button></> : <a href={document.fileUrl} target="_blank" rel="noreferrer">View file</a> : <span>No file attached</span>}</div>
  </article>)}</div>;
}

function ProfileValue({ label, value, editable = false, name, onChange }) {
  return <div className="emr-profile-field"><span>{label}</span>{editable
    ? <input className="emr-profile-edit-input" name={name} value={value ?? ""} onChange={(event) => onChange(name, event.target.value)} />
    : <div>{value || "—"}</div>}</div>;
}

const OMIT_FORM_FIELDS = new Set(["studentid", "documenttitle", "fileurl", "submittedat"]);
const HEALTH_INDICATOR_QUESTIONS = [
  "Do you have any musculo-skeletal injury (e.g., fracture, ligament tear)?",
  "Do you have any allergies (e.g., food, medication)?",
  "Do you have any mental or behavioral health problems?",
  "Have you had any previous surgical procedures?",
  "Do you have an ongoing medical condition?",
  "Are you currently taking any medication?",
  "Have you ever been hospitalized for more than 1 day?",
  "Has a doctor ever denied or restricted your participation in sports or physical activities?",
  "Have you ever passed out or felt dizzy during or after exercise?",
  "Have you ever felt discomfort, pain, or pressure in your chest during exercise?",
  "Are you a smoker or vape user?",
  "Do you drink alcoholic beverages?",
];
function flattenFormPayload(payload, prefix = "") {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload).flatMap(([key, value]) => {
    if (OMIT_FORM_FIELDS.has(key.toLowerCase())) return [];
    const isHealthIndicator = prefix === "healthIndicators";
    const label = isHealthIndicator
      ? (/^\d+$/.test(key) ? HEALTH_INDICATOR_QUESTIONS[Number(key) - 1] || key : key)
      : prefix ? `${prefix} / ${key}` : key;
    if (value == null || value === "") return [];
    if (Array.isArray(value)) return [[label, value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ")]];
    if (typeof value === "object") return flattenFormPayload(value, isHealthIndicator ? "healthIndicators" : label);
    return [[label, String(value)]];
  });
}

function HealthStatusDeclarationTab({ submissions, canReviewDocuments, canEditDeclaration, updatingDocumentId, onStatusChange, editingDeclarationId, declarationDraft, setDeclarationDraft, onEdit, onCancelEdit, onSaveEdit, savingDeclaration }) {
  return <div className="emr-health-declaration">
    <h2 className="section-title">Health Status Declaration</h2>
    {submissions.length ? submissions.map((submission) => {
      const answers = flattenFormPayload(submission.rawPayload || {}).filter(([label]) => !/^(id|response id|responder email)$/i.test(label));
      return <article className="emr-health-submission" key={submission._id}>
        <header><strong>Submitted {formatDate(submission.createdAt)} · {submission.rawPayload?.responderName || submission.rawPayload?.name || "Health Status Declaration"}</strong><span className={`badge ${submission.status === "Verified" ? "badge-routine" : submission.status === "Rejected" ? "badge-high" : "badge-standard"}`}>{submission.status === "Pending" ? "Pending Verification" : submission.status || "Submitted"}</span>{canReviewDocuments && submission.status === "Pending" && <select className="text-input document-status-select" aria-label="Verify or reject Health Status Declaration" value="Pending" disabled={updatingDocumentId === submission._id} onChange={(event) => onStatusChange(submission._id, event.target.value)}><option value="Pending">Choose decision</option><option>Verified</option><option>Rejected</option></select>}{canEditDeclaration && <button type="button" className="btn btn-outline btn-sm" disabled={savingDeclaration} onClick={() => onEdit(submission)}>{editingDeclarationId === submission._id ? "Editing" : "Edit existing declaration"}</button>}</header>
        {submission.verificationRemarks && <p><strong>Verification remarks:</strong> {submission.verificationRemarks}</p>}
        {submission.verificationHistory?.length > 0 && <details className="emr-document-details"><summary>Verification history</summary><ul>{submission.verificationHistory.map((event, index) => <li key={`${event.at || index}-${index}`}>{event.status} · {formatDate(event.at)}{event.actor?.name ? ` · ${event.actor.name}` : ""}{event.remarks ? ` — ${event.remarks}` : ""}</li>)}</ul></details>}
        {submission.declarationHistory?.length > 0 && <details className="emr-document-details"><summary>Correction and submission history</summary><ul>{submission.declarationHistory.map((event, index) => <li key={`${event.at || index}-${index}`}>{event.source?.replaceAll("_", " ") || "Update"} · {formatDate(event.at)}{event.actor?.name ? ` · ${event.actor.name}` : ""}{event.changedFields?.length ? ` · Changed: ${event.changedFields.join(", ")}` : ""}</li>)}</ul></details>}
        {editingDeclarationId === submission._id && <section className="emr-declaration-editor"><label htmlFor="emr-declaration-json">Correct declaration fields (JSON)</label><textarea id="emr-declaration-json" rows={16} value={declarationDraft} onChange={(event) => setDeclarationDraft(event.target.value)} spellCheck="false" /><p>Saving updates this existing record. A change to a verified declaration returns it to Pending Verification.</p><div><button type="button" className="btn btn-primary" disabled={savingDeclaration} onClick={() => onSaveEdit(submission)}>{savingDeclaration ? "Saving…" : "Save correction"}</button><button type="button" className="btn btn-outline" disabled={savingDeclaration} onClick={onCancelEdit}>Cancel</button></div></section>}
        {answers.length ? <dl>{answers.map(([question, answer]) => <div key={question}><dt>{question.includes("?") ? question : question.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ")}</dt><dd>{answer}</dd></div>)}</dl> : <p>No declaration answers were included in this submission.</p>}
      </article>;
    }) : <div className="table-empty">No Health Status Declaration has been submitted for this patient.</div>}
  </div>;
}

function MedicalDocumentSubmissions({ files, canReviewDocuments, updatingDocumentId, onStatusChange, onRetryCertificate }) {
  if (!files.length) return <div className="table-empty">No documents have been submitted for this patient.</div>;
  return <div className="emr-document-list">{files.map((file) => <article className="emr-document-card" key={file.id}>
    <header><h3>{file.title || file.name || "Medical document submission"}</h3><span>Submitted {formatDate(file.date)}</span></header>
    <div className="emr-document-card-grid">
      <div><span>Category</span><strong>{file.category || "N/A"}</strong></div>
      <div><span>Purpose</span><strong>{file.purpose || "N/A"}</strong></div>
      <div><span>Exam / issue date</span><strong>{file.examDate ? formatDate(file.examDate) : "N/A"}</strong></div>
      <div><span>File name</span><strong>{file.name || "N/A"}</strong></div>
      <div><span>Status</span>{canReviewDocuments ? <select className="text-input document-status-select" aria-label={`Change status for ${file.title || file.name || "document"}`} value={file.status || "Pending"} disabled={updatingDocumentId === file.id || ["Verified", "Rejected"].includes(file.status)} onChange={(event) => onStatusChange(file.id, event.target.value)}><option>Pending</option><option>Verified</option><option>Rejected</option></select> : <strong>{file.status || "Pending"}</strong>}</div>
    </div>
    {file.verificationRemarks && <p className="emr-document-review-remarks"><strong>Review remarks:</strong> {file.verificationRemarks}</p>}
    {Object.keys(file.details || {}).length > 0 && <details className="emr-document-details"><summary>View submitted details</summary><dl>{flattenFormPayload(file.details || {}).map(([key, value]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ")}</dt><dd>{value}</dd></div>)}</dl></details>}
    {file.verificationHistory?.length > 0 && <details className="emr-document-details"><summary>Review history</summary><ul>{file.verificationHistory.map((event, index) => <li key={`${event.at || index}-${index}`}>{event.status} · {formatDate(event.at)}{event.actor?.name ? ` · ${event.actor.name}` : ""}{event.remarks ? ` — ${event.remarks}` : ""}</li>)}</ul></details>}
    <div className="document-actions">{file.issuedCertificate ? <ClearanceCertificateAction certificate={file.issuedCertificate} /> : canReviewDocuments && file.clearanceCertificateEligible && file.status === "Verified" && <button type="button" className="btn btn-outline btn-sm" disabled={updatingDocumentId === file.id} onClick={() => onRetryCertificate(file.id)}>Generate Clearance</button>}{file.name ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => openMedicalDocument(file.id, file.name).catch((error) => appDialog.alert(error.message || "Could not open this document."))}>View Submitted File</button> : !file.issuedCertificate && <span>No file attached</span>}</div>
  </article>)}</div>;
}

function KioskRequestsTab({ requests = [] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(requests.length / EMR_RECORDS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleRequests = requests.slice((currentPage - 1) * EMR_RECORDS_PER_PAGE, currentPage * EMR_RECORDS_PER_PAGE);
  const formatDetails = (value) => {
    if (!value) return "—";
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed).map(([key, item]) => {
          const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
          const detail = Array.isArray(item) ? item.join(", ") : typeof item === "object" && item !== null ? JSON.stringify(item) : String(item);
          return `${label}: ${detail}`;
        }).join(" · ");
      }
    } catch { /* Non-JSON details are free-text requests. */ }
    return value;
  };
  return <details className="emr-compact-section">
    <summary><span>Kiosk Service Requests</span><span className="emr-compact-count">{requests.length} {requests.length === 1 ? "request" : "requests"}</span></summary>
    {requests.length ? <div className="table-wrap"><table className="data-table">
      <thead><tr><th>Date</th><th>Service</th><th>Reason</th><th>Details entered at kiosk</th></tr></thead>
      <tbody>{visibleRequests.map((request) => <tr key={request._id}><td>{formatDate(request.createdAt)}</td><td>{request.serviceType || "—"}</td><td>{request.reason || "—"}</td><td>{formatDetails(request.requestDetails)}</td></tr>)}</tbody>
    </table></div> : <div className="table-empty">No kiosk service requests recorded for this patient.</div>}
    {pageCount > 1 && <nav className="emr-record-pagination" aria-label="Kiosk service request pages"><button type="button" className="btn btn-outline btn-sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" className="btn btn-outline btn-sm" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></nav>}
  </details>;
}

function MedicalProfileSections({ entry, vitals = [], editable = false, onFieldChange }) {
  const fields = entry?.fields || {};
  const latestVitals = vitals[0] || {};
  const profileField = (key, label, fallback = "") => <ProfileValue key={key} label={label} value={fields[key] ?? fallback} editable={editable} name={key} onChange={onFieldChange} />;
  return <div className="emr-profile-sections">
    {fields.clearancePurpose && <section className="emr-profile-section emr-clearance-profile"><h3>Medical Clearance</h3><div className="emr-profile-fields"><ProfileValue label="Clearance Purpose" value={fields.clearancePurpose} /><ProfileValue label="Provider Determination" value={fields.providerStatement} /><ProfileValue label="Approved By" value={`${fields.providerRole || "Provider"} - ${entry.provider || ""}`} /><ProfileValue label="Clearance Assessment" value={[fields.clearanceAssessment?.physicalExam, fields.clearanceAssessment?.laboratoryExamination, fields.clearanceAssessment?.notes].filter(Boolean).join(" | ")} /></div><h4>Requirement Review</h4><ul>{(fields.requirementChecks || []).map((item, index) => <li key={`${item.text}-${index}`}>{item.text} - {item.status?.replaceAll("_", " ")}{item.evidence ? ` (${item.evidence})` : ""}</li>)}</ul></section>}
    <section className="emr-profile-section">
      <h3>Physical Examination</h3>
      <div className="emr-physical-layout">
        <div className="emr-profile-fields">
          {editable ? <div className="emr-profile-field emr-profile-bp-edit"><span>Blood Pressure (mmHg)</span><div><input className="emr-profile-edit-input" aria-label="Systolic blood pressure" placeholder="Systolic" value={fields.blood_pressure_systolic ?? ""} onChange={(event) => onFieldChange("blood_pressure_systolic", event.target.value)} /><span>/</span><input className="emr-profile-edit-input" aria-label="Diastolic blood pressure" placeholder="Diastolic" value={fields.blood_pressure_diastolic ?? ""} onChange={(event) => onFieldChange("blood_pressure_diastolic", event.target.value)} /></div></div> : <ProfileValue label="Blood Pressure (mmHg)" value={fields.blood_pressure_systolic || fields.blood_pressure_diastolic ? `${fields.blood_pressure_systolic || "—"} / ${fields.blood_pressure_diastolic || "—"}` : latestVitals.bloodPressure} />}
          {["height_cm", "weight_kg", "abdomen", "ears", "eyes_pupils", "heart", "lungs", "nose", "skin", "thorax", "extremities", "deformities"].map((key) => profileField(key, key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), key === "height_cm" ? latestVitals.heightCm : key === "weight_kg" ? latestVitals.weightKg : ""))}
        </div>
        <div className="emr-profile-aside">
          <div className="emr-kiosk-intake"><strong>Kiosk Intake:</strong><span>{latestVitals.temperatureC != null ? `${latestVitals.temperatureC}°C` : "—"} · last captured at {latestVitals.capturedAt ? formatDate(latestVitals.capturedAt) : "—"}</span></div>
          <ProfileValue label="BP Status" value={latestVitals.bloodPressureStatus || latestVitals.bloodPressureClassification} />
          <ProfileValue label="BMI / Classification" value={latestVitals.bmi != null ? `${latestVitals.bmi} · ${latestVitals.bmiCategory || "Unclassified"}` : ""} />
          {profileField("physical_other_findings", "Other Pertinent Findings")}
        </div>
      </div>
    </section>
    <section className="emr-profile-section">
      <h3>Laboratory Examination</h3>
      <div className="emr-profile-fields emr-lab-fields">
        {profileField("chest_xray", "Chest X-Ray")}
        {profileField("lab_significant_findings", "Significant Findings")}
        {profileField("cardio_clearance", "Cardio Clearance")}
        {profileField("lab_remarks", "Remarks")}
      </div>
    </section>
    <section className="emr-profile-section">
      <h3>Medical Results</h3>
      <div className="emr-profile-fields emr-result-fields">
        {profileField("medical_findings", "Findings")}
        {profileField("diagnosis", "Diagnosis")}
        {profileField("treatment_remarks", "Treatment / Remarks", fields.treatment || fields.providerStatement || "")}
        {profileField("medicine_issued", "Medicine Issued")}
      </div>
    </section>
  </div>;
}

function MedicalProfileHistory({ entries, vitals, studentMongoId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [previousPage, setPreviousPage] = useState(1);
  const [draft, setDraft] = useState({});
  const [profileMeta, setProfileMeta] = useState({ purpose: "", provider: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const latest = entries[0];
  const previous = entries.slice(1);
  const previousPageCount = Math.max(1, Math.ceil(previous.length / EMR_RECORDS_PER_PAGE));
  const currentPreviousPage = Math.min(previousPage, previousPageCount);
  const visiblePrevious = previous.slice((currentPreviousPage - 1) * EMR_RECORDS_PER_PAGE, currentPreviousPage * EMR_RECORDS_PER_PAGE);
  function startEditing() {
    setDraft({ ...(latest?.fields || {}) });
    setProfileMeta({ purpose: latest?.purpose || "Medical Examination", provider: latest?.provider || "" });
    setSaveError("");
    setEditing(true);
  }
  async function saveEdits() {
    if (!latest?._id) {
      setSaveError("There is no medical profile to edit yet. Add the initial examination from New Medical Record.");
      return;
    }
    if (!studentMongoId || !profileMeta.purpose.trim()) {
      setSaveError("Enter a purpose before saving the medical profile.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const payload = { ...profileMeta, fields: draft };
      const updated = await updateMedicalProfile(latest._id, payload);
      onSaved(updated);
      setEditing(false);
    } catch (error) {
      setSaveError(error.response?.data?.message || "Could not save the medical profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  return <>
    <div className="emr-profile-toolbar"><div className="emr-profile-meta">{latest ? <>Last examined: {new Date(latest.examinedAt).toLocaleString()} · {latest.purpose} · {latest.provider}</> : "No medical profile has been saved for this patient."}</div><div className="emr-profile-edit-actions">{editing ? <><button className="btn btn-success" type="button" disabled={saving} onClick={saveEdits}>{saving ? "Saving…" : "Save medical profile"}</button><button className="btn btn-outline" type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button></> : <button className="btn btn-primary" type="button" disabled={!latest} onClick={startEditing}>Edit medical profile</button>}</div></div>
    {!latest && <p className="emr-profile-empty-history">No saved medical profile is available to edit. Use New Medical Record to add the initial examination.</p>}
    {editing && <div className="emr-profile-meta-edit"><label>Purpose<input value={profileMeta.purpose} onChange={(event) => setProfileMeta((current) => ({ ...current, purpose: event.target.value }))} /></label><label>Provider<input value={profileMeta.provider} onChange={(event) => setProfileMeta((current) => ({ ...current, provider: event.target.value }))} /></label></div>}
    {saveError && <p className="error-text" role="alert">{saveError}</p>}
    <MedicalProfileSections entry={editing ? { ...latest, fields: draft } : latest} vitals={vitals} editable={editing} onFieldChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))} />
    {previous.length ? <details className="emr-compact-section emr-previous-profiles">
      <summary><span>Previous Medical Profile History</span><span className="emr-compact-count">{previous.length} {previous.length === 1 ? "record" : "records"}</span></summary>
      <div className="emr-profile-previous">{visiblePrevious.map((entry) => <details key={entry.id}>
        <summary>{new Date(entry.examinedAt).toLocaleString()} · {entry.purpose} · {entry.provider}</summary>
        <MedicalProfileSections entry={entry} />
      </details>)}</div>
      {previousPageCount > 1 && <nav className="emr-record-pagination" aria-label="Previous medical profile pages"><button type="button" className="btn btn-outline btn-sm" disabled={currentPreviousPage <= 1} onClick={() => setPreviousPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {currentPreviousPage} of {previousPageCount}</span><button type="button" className="btn btn-outline btn-sm" disabled={currentPreviousPage >= previousPageCount} onClick={() => setPreviousPage((value) => Math.min(previousPageCount, value + 1))}>Next</button></nav>}
    </details> : <><h2 className="section-title emr-history-title">Previous Medical Profile History</h2><p className="emr-profile-empty-history">No previous medical profiles recorded.</p></>}
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
  { key: "files", label: "Documents & Attachments", icon: "📁" },
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
  const [updatingDocumentId, setUpdatingDocumentId] = useState(null);
  const [editingDeclarationId, setEditingDeclarationId] = useState(null);
  const [declarationDraft, setDeclarationDraft] = useState("");
  const [savingDeclaration, setSavingDeclaration] = useState(false);
  const [declarationNotice, setDeclarationNotice] = useState("");
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const canReviewDocuments = ["nurse", "supervisor"].includes(normalizeRole(user.role));
  const canEditDeclaration = normalizeRole(user.role) === "superadmin";

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
      setMedicalDocumentFiles((full.documents || []).filter((file) => file.formSource === "Kiosk Document Submission" && !file.clearanceWorkflow && !isHealthStatusDeclaration(file)).map((file) => ({ id: file._id, category: file.category, title: file.documentTitle, purpose: file.submissionDetails?.purpose, examDate: file.examDate, date: file.submittedAt, name: file.contentType === "application/json" ? file.name?.replace(/\.json$/i, ".pdf") : file.name, fileUrl: file.fileUrl, status: file.status, details: file.submissionDetails, verificationRemarks: file.verificationRemarks, verificationHistory: file.verificationHistory, issuedCertificate: file.issuedCertificate, clearanceCertificateEligible: file.clearanceCertificateEligible })));
      const kioskHealthForms = (full.documents || []).filter((document) => document.submissionDetails?.healthDeclaration).map((document) => ({
        _id: document._id,
        createdAt: document.submittedAt || document.createdAt,
        status: document.status,
          verificationRemarks: document.verificationRemarks,
          verificationHistory: document.verificationHistory,
          declarationHistory: document.declarationHistory,
        rawPayload: document.submissionDetails.healthDeclaration,
      }));
      setHealthStatusSubmissions(kioskHealthForms);
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

  async function changeDocumentStatus(id, status) {
    let remarks = "";
    if (status !== "Pending") {
      const enteredRemarks = await appDialog.prompt(`Add a brief ${status === "Verified" ? "verification" : "rejection"} remark:`, "", status === "Verified" ? "Accept document" : "Reject document");
      if (enteredRemarks === null) return;
      remarks = enteredRemarks.trim();
      if (remarks.length < 3) {
        await appDialog.alert("Enter at least 3 characters for the review remark.");
        return;
      }
    }
    setUpdatingDocumentId(id);
    setError(null);
    try {
      const updated = await updateMedicalDocumentStatus(id, status, remarks);
      setRecord((current) => current ? { ...current, ...(updated.patient ? { student: updated.patient } : {}), documents: (current.documents || []).map((document) => document._id === id ? { ...document, ...updated } : document) } : current);
      setMedicalDocumentFiles((current) => current.map((file) => file.id === id ? { ...file, status: updated.status, verificationRemarks: updated.verificationRemarks, verificationHistory: updated.verificationHistory, issuedCertificate: updated.issuedCertificate || file.issuedCertificate, clearanceCertificateEligible: updated.clearanceCertificateEligible } : file));
      setHealthStatusSubmissions((current) => current.map((submission) => submission._id === id ? { ...submission, status: updated.status, verificationRemarks: updated.verificationRemarks, verificationHistory: updated.verificationHistory } : submission));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not update this document status.");
    } finally {
      setUpdatingDocumentId(null);
    }
  }

  async function retryClearanceCertificate(id) {
    setUpdatingDocumentId(id);
    setError(null);
    try {
      const updated = await updateMedicalDocumentStatus(id, "Verified", "Certificate generation retry after existing verification.");
      setRecord((current) => current ? { ...current, documents: (current.documents || []).map((document) => document._id === id ? { ...document, ...updated } : document) } : current);
      setMedicalDocumentFiles((current) => current.map((file) => file.id === id ? { ...file, issuedCertificate: updated.issuedCertificate, clearanceCertificateEligible: updated.clearanceCertificateEligible } : file));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not generate the clearance certificate.");
    } finally {
      setUpdatingDocumentId(null);
    }
  }

  function beginDeclarationEdit(submission) {
    setEditingDeclarationId(submission._id);
    setDeclarationDraft(JSON.stringify(submission.rawPayload || {}, null, 2));
    setError(null);
    setDeclarationNotice("");
  }

  async function saveDeclarationEdit(submission) {
    let declaration;
    try { declaration = JSON.parse(declarationDraft); }
    catch { setError("The declaration correction is not valid JSON."); return; }
    setSavingDeclaration(true);
    setError(null);
    try {
      const result = await updateHealthDeclaration(submission._id, declaration);
      setRecord((current) => current ? { ...current, student: result.patient, documents: (current.documents || []).map((document) => document._id === submission._id ? { ...document, ...result.document } : document) } : current);
        setHealthStatusSubmissions((current) => current.map((item) => item._id === submission._id ? { ...item, status: result.document.status, rawPayload: result.document.submissionDetails?.healthDeclaration, verificationRemarks: result.document.verificationRemarks, verificationHistory: result.document.verificationHistory, declarationHistory: result.document.declarationHistory } : item));
      setEditingDeclarationId(null);
      setDeclarationDraft("");
      setError(null);
      setDeclarationNotice(result.message);
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Could not save the correction to this declaration.");
    } finally {
      setSavingDeclaration(false);
    }
  }

  function replaceLatestMedicalProfile(updated) {
    setProfileHistory((current) => [
      { ...updated, id: updated._id },
      ...current.filter((profile) => profile._id !== updated._id),
    ].sort((left, right) => new Date(right.examinedAt) - new Date(left.examinedAt)));
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
      {declarationNotice && <p className="emr-declaration-notice" role="status">{declarationNotice}</p>}

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
            <h1>Full Medical Record</h1>
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
              <div><span className="field-label-inline">Name:</span> {record.student.lastName}, {record.student.firstName}{record.student.middleName ? ` ${record.student.middleName}` : ""}</div>
              <div><span className="field-label-inline">Student ID:</span> {record.student.studentId}</div>
              <div><span className="field-label-inline">Patient Type:</span> {patientType(record.student)}</div>
              <div><span className="field-label-inline">Program / Department:</span> {patientDepartment(record.student)}</div>
              <div><span className="field-label-inline">Official Email:</span> {patientEmail(record.student)}</div>
              <div><span className="field-label-inline">Year Level:</span> {record.student.displayYearLevel || record.student.yearLevel || "—"}{record.student.expectedYearLevel && record.student.yearLevelOverride && <small> (expected {record.student.expectedYearLevel}; authorized override)</small>}</div>
              <div><span className="field-label-inline">School Year:</span> {record.student.schoolYear || "—"}</div>
              <div><span className="field-label-inline">Date of Birth:</span> {record.student.dateOfBirth ? new Intl.DateTimeFormat([], { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(record.student.dateOfBirth)) : "—"}</div>
              <div><span className="field-label-inline">Age:</span> {record.student.age ?? "—"}</div>
              <div><span className="field-label-inline">Sex:</span> {record.student.sex || "—"}</div>
              <div><span className="field-label-inline">Religion:</span> {record.student.religion || "—"}</div>
              <div><span className="field-label-inline">Home Address:</span> {record.student.homeAddress || "—"}</div>
              <div><span className="field-label-inline">Mobile Number:</span> {record.student.mobileNumber || "—"}</div>
              <div><span className="field-label-inline">Parent / Guardian:</span> {record.student.guardianName || "—"}</div>
              <div><span className="field-label-inline">Guardian Contact:</span> {record.student.guardianContact || "—"}</div>
              <div><span className="field-label-inline">Health Status Declaration:</span> {record.student.healthDeclarationStatus === "Pending" ? "Pending Verification" : record.student.healthDeclarationStatus || "Not Submitted"}</div>
              <div><span className="field-label-inline">Declared Health Conditions:</span> {record.student.healthFlags?.length ? record.student.healthFlags.join(", ") : "None declared"}</div>
              <div><span className="field-label-inline">PWD Declaration:</span> {record.student.hasDisability ? record.student.specifiedDisability || "Yes" : record.student.hasDisability === false ? "No" : "—"}</div>
              <div><span className="field-label-inline">Treatment Consent:</span> {record.student.treatmentConsent || "—"}</div>
              <div><span className="field-label-inline">Travel Health Declaration:</span> {record.student.travelRestrictionsOrIssues || "—"}</div>
            </div>
            {Object.keys(record.student.healthIndicators || {}).length > 0 && <details className="emr-document-details"><summary>Declared health-screen answers</summary><dl>{Object.entries(record.student.healthIndicators).map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}</dl></details>}
            <p className="page-subtitle">Declaration status is shown above. Current patient details reflect the declaration where provided; fields it does not collect remain from their existing source.</p></div>}
            {tab === "profile" && <><MedicalProfileHistory entries={profileHistory} vitals={record.vitals || []} studentMongoId={record.student._id} onSaved={replaceLatestMedicalProfile} /><KioskRequestsTab requests={record.kioskRequests} /></>}
            {tab === "history" && <MedicalHistoryTab value={medicalHistory} onChange={setMedicalHistory} editing={editingMedicalHistory} onToggleEdit={toggleMedicalHistoryEdit} />}
            {tab === "family" && <FamilyHistoryTab value={familyHistory} onChange={setFamilyHistory} editing={editingFamilyHistory} onToggleEdit={toggleFamilyHistoryEdit} />}
            {tab === "forms" && <HealthStatusDeclarationTab submissions={healthStatusSubmissions} canReviewDocuments={canReviewDocuments} canEditDeclaration={canEditDeclaration} updatingDocumentId={updatingDocumentId} onStatusChange={changeDocumentStatus} editingDeclarationId={editingDeclarationId} declarationDraft={declarationDraft} setDeclarationDraft={setDeclarationDraft} onEdit={beginDeclarationEdit} onCancelEdit={() => { setEditingDeclarationId(null); setDeclarationDraft(""); }} onSaveEdit={saveDeclarationEdit} savingDeclaration={savingDeclaration} />}
            {tab === "files" && <div className="emr-files-sections">
              <p className="page-subtitle">Clearance records and certificates, submitted documents, and other medical files are grouped below.</p>
              <section className="emr-files-section">
                <h2 className="section-title">Medical Clearances ({record.medicalWorkflows?.length || 0})</h2>
                <MedicalClearanceForms workflows={record.medicalWorkflows || []} documents={record.documents || []} />
              </section>
              <section className="emr-files-section">
                <h2 className="section-title">Submitted Documents ({medicalDocumentFiles.length})</h2>
                <MedicalDocumentSubmissions files={medicalDocumentFiles} canReviewDocuments={canReviewDocuments} updatingDocumentId={updatingDocumentId} onStatusChange={changeDocumentStatus} onRetryCertificate={retryClearanceCertificate} />
              </section>
              <section className="emr-files-section">
                <h2 className="section-title">Other Medical Files ({(record.documents || []).filter((document) => !isHealthStatusDeclaration(document) && !(document.recordType === "clearance_certificate" && (document.sourceDocument || document.sourceWorkflow)) && !document.clearanceWorkflow && document.formSource !== "Kiosk Document Submission").length})</h2>
                <DocumentsTab documents={(record.documents || []).filter((document) => !isHealthStatusDeclaration(document) && !(document.recordType === "clearance_certificate" && (document.sourceDocument || document.sourceWorkflow)) && !document.clearanceWorkflow && document.formSource !== "Kiosk Document Submission")} canReviewDocuments={canReviewDocuments} updatingDocumentId={updatingDocumentId} onStatusChange={changeDocumentStatus} />
              </section>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}
