import { useEffect, useMemo, useState } from "react";
import { approveMedicalClearance, getMedicalDocuments, saveClearanceAssessment, updateClearanceRequirement } from "../services/api.js";
import { openMedicalDocument } from "../utils/medicalDocuments.js";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/NewMedicalRecord.css";

export default function ClearanceWorkflowModal({ entry, onClose, onUpdated }) {
  const workflow = entry?.medicalWorkflow;
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const [currentWorkflow, setCurrentWorkflow] = useState(workflow);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [assessment, setAssessment] = useState({ physicalExam: workflow?.assessment?.physicalExam || "", laboratoryExamination: workflow?.assessment?.laboratoryExamination || "", notes: workflow?.assessment?.notes || "" });
  const [statement, setStatement] = useState(workflow?.providerStatement || "");
  const [evidence, setEvidence] = useState({});
  const [selectedDocs, setSelectedDocs] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const studentId = entry.student?._id || entry.student;
  const patientDocuments = useMemo(() => documents.filter((doc) => String(doc.student?._id || doc.student) === String(studentId) && doc.status === "Verified"), [documents, studentId]);
  const clearanceDocuments = useMemo(() => documents.filter((doc) => String(doc.clearanceWorkflow?._id || doc.clearanceWorkflow) === String(workflow?._id)), [documents, workflow?._id]);

  async function refreshDocuments() {
    setDocumentsLoading(true);
    try { const result = await getMedicalDocuments(); setDocuments(Array.isArray(result) ? result : result.documents || []); }
    catch { setError("Could not load documents submitted for this clearance."); }
    finally { setDocumentsLoading(false); }
  }

  useEffect(() => { refreshDocuments(); }, []);

  async function run(action) {
    setBusy(true); setError("");
    try { const updated = await action(); if (updated?._id) setCurrentWorkflow(updated); onUpdated?.(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Could not save the clearance workflow."); }
    finally { setBusy(false); }
  }
  async function saveAssessment(event) {
    event.preventDefault();
    await run(() => saveClearanceAssessment(workflow._id, assessment));
  }
  async function setRequirement(index, status, item) {
    const payload = { status, evidence: evidence[index] || "" };
    if (item.kind === "document" && status === "satisfied") payload.documentId = selectedDocs[index];
    await run(() => updateClearanceRequirement(workflow._id, index, payload));
  }
  async function approve(event) {
    event.preventDefault();
    await run(() => approveMedicalClearance(workflow._id, statement));
  }

  if (!currentWorkflow) return null;
  const activeWorkflow = currentWorkflow;
  const assessmentOpen = ["assessment", "requirements_pending", "ready_for_approval"].includes(activeWorkflow.status);
  const approvalOpen = ["ready_for_approval", "approval_in_progress"].includes(activeWorkflow.status) && (activeWorkflow.status !== "approval_in_progress" || String(activeWorkflow.providerApproval?.approvedBy?._id || activeWorkflow.providerApproval?.approvedBy) === String(user.id || user._id));
  const statusLabel = activeWorkflow.status === "ready_for_approval" ? "Ready for nurse completion" : String(activeWorkflow.status || "").replaceAll("_", " ");
  return <div className="active-session-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="active-session-modal clearance-workflow-modal" role="dialog" aria-modal="true" aria-labelledby="clearance-title">
      <header className="active-session-header"><div><h2 id="clearance-title">Medical Clearance — {activeWorkflow.purpose}</h2><p>{entry.student?.firstName} {entry.student?.lastName} · {entry.student?.studentId} · Queue {entry.queueNumber}</p></div><button type="button" className="active-session-close" onClick={onClose} aria-label="Close clearance workflow">×</button></header>
      <div className="active-session-body">
        <div className="record-summary"><div><h3>{entry.student?.lastName}, {entry.student?.firstName}</h3><p>Affiliation: {entry.student?.affiliation || activeWorkflow.affiliation}</p><p>Department: {entry.student?.department || entry.student?.program || "—"}</p><p>Official Email: {entry.student?.email || "—"}</p></div><div><p>Clearance purpose: {activeWorkflow.purpose}</p><p>Started: {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</p><p>Workflow status: {statusLabel}</p></div></div>
        <section className="record-section clearance-submitted-documents"><div className="clearance-documents-heading"><h3>Documents Submitted for This Clearance</h3><button type="button" className="btn btn-secondary btn-sm" onClick={refreshDocuments} disabled={documentsLoading}>{documentsLoading ? "Refreshing…" : "Refresh documents"}</button></div>{documentsLoading ? <p role="status">Loading submitted files…</p> : clearanceDocuments.length ? <ul>{clearanceDocuments.map((doc) => <li key={doc._id}><span><strong>{doc.clearanceRequirementText || doc.submissionDetails?.clearanceRequirementText || "Clearance document"}</strong><br />{doc.name || doc.documentTitle} · {doc.status} · Submitted {new Date(doc.submittedAt || doc.createdAt).toLocaleString()}</span>{doc.name && <button type="button" className="btn btn-outline btn-sm" onClick={() => openMedicalDocument(doc._id, doc.name).catch((openError) => setError(openError.message || "Could not open this submitted file."))}>View Submitted File</button>}</li>)}</ul> : <p>No files have been submitted for this clearance yet.</p>}</section>
        <section className="record-section"><h3>Clearance Requirements</h3><ol>{activeWorkflow.requirements?.map((item, index) => <li key={`${item.text}-${index}`}>{item.text} — {String(item.status || "pending").replaceAll("_", " ")}{item.evidence ? ` · ${item.evidence}` : ""}</li>)}</ol></section>
        {assessmentOpen && <form onSubmit={saveAssessment} className="record-section"><h3>Nurse Assessment and Requirement Review</h3><div className="exam-grid"><label>Physical Examination<textarea className="text-input" rows={3} value={assessment.physicalExam} onChange={(event) => setAssessment({ ...assessment, physicalExam: event.target.value })} /></label><label>Laboratory Examination<textarea className="text-input" rows={3} value={assessment.laboratoryExamination} onChange={(event) => setAssessment({ ...assessment, laboratoryExamination: event.target.value })} /></label><label className="exam-wide">Notes<textarea className="text-input" rows={2} value={assessment.notes} onChange={(event) => setAssessment({ ...assessment, notes: event.target.value })} /></label></div><button className="btn btn-primary" disabled={busy}>Save Nurse Assessment</button></form>}
        {!["approved", "completed"].includes(activeWorkflow.status) && activeWorkflow.requirements?.map((item, index) => <section className="record-section" key={`req-${index}`}><h3>{item.text}</h3><p>{item.required ? "Required" : item.conditional ? `Conditional${item.condition ? `: ${item.condition}` : ""}` : "Optional"}</p>{item.kind === "document" && <label>Verified patient document<select className="text-input" value={selectedDocs[index] || ""} onChange={(event) => setSelectedDocs({ ...selectedDocs, [index]: event.target.value })}><option value="">Select a verified matching file</option>{patientDocuments.map((doc) => <option key={doc._id} value={doc._id}>{doc.documentTitle || doc.name || doc.category} · {doc.category}</option>)}</select></label>}{item.kind !== "document" && <label>Evidence / completion note<textarea className="text-input" rows={2} value={evidence[index] || ""} onChange={(event) => setEvidence({ ...evidence, [index]: event.target.value })} /></label>}<div className="modal-actions"><button type="button" className="btn btn-success" disabled={busy || (item.kind === "document" && !selectedDocs[index])} onClick={() => setRequirement(index, "satisfied", item)}>Mark Satisfied</button>{item.conditional && <button type="button" className="btn btn-secondary" disabled={busy || !evidence[index]?.trim()} onClick={() => setRequirement(index, "not_applicable", item)}>Not Applicable</button>}{item.status !== "pending" && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRequirement(index, "pending", item)}>Reset to Pending</button>}</div></section>)}
        {approvalOpen && <form onSubmit={approve} className="record-section"><h3>Nurse Verification and Certificate</h3><label>Nurse's final clearance statement<textarea className="text-input" rows={4} minLength={10} required value={statement} onChange={(event) => setStatement(event.target.value)} /></label><p>Completing this verification issues the purpose-specific certificate to the patient's Full EMR → Documents &amp; Attachments.</p><button className="btn btn-success" disabled={busy || statement.trim().length < 10}>Complete Clearance and Issue Certificate</button></form>}
        {activeWorkflow.status === "approved" || activeWorkflow.status === "completed" ? <p role="status">Certificate issued and saved in Documents &amp; Attachments.</p> : null}
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}
