import { useEffect, useMemo, useState } from "react";
import { approveMedicalClearance, completeMedicalClearance, getMedicalDocuments, submitPublicClearanceDocument, updateMedicalDocumentStatus } from "../services/api.js";
import { openMedicalDocument } from "../utils/medicalDocuments.js";
import VerifiedClearanceCertificate from "./VerifiedClearanceCertificate.jsx";
import "../styles/components/ActiveSessionModal.css";
import "../styles/pages/NewMedicalRecord.css";

const MAX_UPLOAD_SIZE = 12 * 1024 * 1024;
const ACCEPTED_UPLOADS = ".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function clinicToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function uploadContentType(file) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })[extension] || "application/octet-stream";
}
async function encodeUpload(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
function requestErrorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data && typeof data.message === "string" && data.message.trim()) return data.message;
  if (data && typeof data.error === "string" && data.error.trim()) return data.error;
  if (typeof data === "string" && data.trim() && !/<!doctype|<html/i.test(data)) return data.trim().slice(0, 240);
  if (error?.response?.status) return `${fallback} (server returned ${error.response.status}).`;
  if (error?.message === "Network Error") return `${fallback} The server could not be reached.`;
  return error?.message || fallback;
}

export default function ClearanceWorkflowModal({ entry, onClose, onUpdated }) {
  const workflow = entry?.medicalWorkflow;
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const [currentWorkflow, setCurrentWorkflow] = useState(workflow);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [directUploads, setDirectUploads] = useState({});
  const [notificationEmail, setNotificationEmail] = useState(entry.student?.email || "");
  const [certificatePreview, setCertificatePreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clearanceDocuments = useMemo(() => documents.filter((doc) => String(doc.clearanceWorkflow?._id || doc.clearanceWorkflow) === String(workflow?._id)), [documents, workflow?._id]);
  async function refreshDocuments() {
    setDocumentsLoading(true);
    try { const result = await getMedicalDocuments(); setDocuments(Array.isArray(result) ? result : result.documents || []); }
    catch { setError("Could not load documents submitted for this clearance."); }
    finally { setDocumentsLoading(false); }
  }
  useEffect(() => { refreshDocuments(); }, []);
  function patchDirectUpload(requirement, patch) {
    setDirectUploads((current) => ({ ...current, [requirement]: { ...current[requirement], ...patch } }));
  }

  async function uploadRequirement(item) {
    const upload = directUploads[item.text] || {};
    if (!upload.file || !upload.examDate) return patchDirectUpload(item.text, { error: "Choose a file and enter its examination or issue date." });
    if (upload.examDate > clinicToday()) return patchDirectUpload(item.text, { error: "The examination or issue date cannot be in the future." });
    if (upload.file.size > MAX_UPLOAD_SIZE) return patchDirectUpload(item.text, { error: "Files cannot exceed 12 MB." });
    const email = String(notificationEmail || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return patchDirectUpload(item.text, { error: "Enter a valid email address for document status updates." });
    const studentId = entry.student?.studentId || entry.student?.employeeId;
    if (!studentId || !activeWorkflow.documentSubmissionToken) return patchDirectUpload(item.text, { error: "This clearance is missing its patient ID or secure upload link. Refresh the clearance and try again." });
    patchDirectUpload(item.text, { saving: true, error: "" });
    try {
      await submitPublicClearanceDocument(activeWorkflow.documentSubmissionToken, {
        studentId,
        notificationEmail: email,
        title: `Medical Clearance Supporting Document - ${activeWorkflow.purpose}`,
        category: "Diagnostic Test (Chest X-ray, ECG, Ultrasound, etc.)",
        examDate: upload.examDate,
        clearanceRequirementText: item.text,
        submissionDetails: { purpose: activeWorkflow.purpose, clearanceRequirementText: item.text, affiliation: activeWorkflow.affiliation },
        name: upload.file.name,
        contentType: uploadContentType(upload.file),
        fileData: await encodeUpload(upload.file),
      });
      patchDirectUpload(item.text, { saving: false, submitted: true, error: "", file: null });
      await refreshDocuments();
    } catch (requestError) {
      patchDirectUpload(item.text, { saving: false, error: requestErrorMessage(requestError, "Could not upload this document.") });
    }
  }

  async function reviewDocument(document, status) {
    setBusy(true);
    setError("");
    let decisionSaved = false;
    try {
      const result = await updateMedicalDocumentStatus(document._id, status, "");
      decisionSaved = true;
      let updatedWorkflow = result.clearanceWorkflowRecord || currentWorkflow;
      if (updatedWorkflow?._id) setCurrentWorkflow(updatedWorkflow);
      if (status === "Verified" && updatedWorkflow?.status === "ready_for_approval" && String(user.role || "").toLowerCase() === "nurse") {
        updatedWorkflow = await approveMedicalClearance(workflow._id, "");
        setCurrentWorkflow(updatedWorkflow);
      }
      await refreshDocuments();
      onUpdated?.(updatedWorkflow);
    } catch (requestError) {
      if (decisionSaved) await refreshDocuments();
      setError(requestErrorMessage(requestError, `Could not ${status === "Verified" ? "accept" : "reject"} this document.`));
    } finally { setBusy(false); }
  }

  async function resumeCertificateApproval() {
    setBusy(true);
    setError("");
    try {
      const updated = await approveMedicalClearance(workflow._id, "");
      setCurrentWorkflow(updated);
      await refreshDocuments();
      onUpdated?.(updated);
    } catch (requestError) {
      await refreshDocuments();
      setError(requestErrorMessage(requestError, "Could not finish issuing this clearance certificate."));
    } finally { setBusy(false); }
  }

  async function completeProcess() {
    setBusy(true);
    setError("");
    try {
      const completed = await completeMedicalClearance(workflow._id);
      setCurrentWorkflow(completed);
      onUpdated?.(completed);
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "Could not complete this clearance process."));
    } finally { setBusy(false); }
  }

  const activeWorkflow = currentWorkflow || {};
  const statusLabel = activeWorkflow.status === "ready_for_approval" ? "Ready for completion" : String(activeWorkflow.status || "").replaceAll("_", " ");
  const canUploadFromComputer = String(user.role || "").toLowerCase() === "nurse" && !entry.queueNumber && !activeWorkflow.queueEntry;
  const clearanceCertificate = activeWorkflow.medicalFile && typeof activeWorkflow.medicalFile === "object"
    ? activeWorkflow.medicalFile
    : documents.find((doc) => doc.recordType === "clearance_certificate" && String(doc.sourceWorkflow?._id || doc.sourceWorkflow) === String(workflow?._id));
  useEffect(() => {
    if (activeWorkflow.status !== "approval_in_progress") return undefined;
    const approvedBy = activeWorkflow.providerApproval?.approvedBy?._id || activeWorkflow.providerApproval?.approvedBy;
    if (String(approvedBy || "") !== String(user.id || user._id || "")) return undefined;
    let active = true;
    setBusy(true);
    setError("");
    approveMedicalClearance(workflow._id, "").then((completed) => {
      if (!active) return;
      setCurrentWorkflow(completed);
      onUpdated?.(completed);
    }).catch((requestError) => {
      if (active) {
        setError(requestErrorMessage(requestError, "Could not resume clearance completion."));
        refreshDocuments();
      }
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [activeWorkflow.status, activeWorkflow.providerApproval?.approvedBy?._id, activeWorkflow.providerApproval?.approvedBy, workflow._id, user.id, user._id, onUpdated]);
  if (!currentWorkflow) return null;
  return <div className="active-session-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="active-session-modal clearance-workflow-modal" role="dialog" aria-modal="true" aria-labelledby="clearance-title">
      <header className="active-session-header"><div><h2 id="clearance-title">Medical Clearance — {activeWorkflow.purpose}</h2><p>{entry.student?.firstName} {entry.student?.lastName} · {entry.student?.studentId} · {entry.queueNumber ? `Queue ${entry.queueNumber}` : "Staff-created clearance"}</p></div><button type="button" className="active-session-close" onClick={onClose} aria-label="Close clearance workflow">×</button></header>
      <div className="active-session-body">
        <div className="record-summary"><div><h3>{entry.student?.lastName}, {entry.student?.firstName}</h3><p>Affiliation: {entry.student?.affiliation || activeWorkflow.affiliation}</p><p>Department: {entry.student?.department || entry.student?.program || "—"}</p><p>Official Email: {entry.student?.email || "—"}</p></div><div><p>Clearance purpose: {activeWorkflow.purpose}</p><p>Started: {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</p><p>Workflow status: {statusLabel}</p></div></div>
        <section className="record-section clearance-submitted-documents"><div className="clearance-documents-heading"><h3>Documents Submitted for This Clearance</h3><button type="button" className="btn btn-secondary btn-sm" onClick={refreshDocuments} disabled={documentsLoading}>{documentsLoading ? "Refreshing…" : "Refresh documents"}</button></div><p>Accept each required document to issue the purpose-specific certificate. Then select Complete Clearance Process to finish the queue entry.</p>{documentsLoading ? <p role="status">Loading submitted files…</p> : clearanceDocuments.length ? <ul>{clearanceDocuments.map((doc) => <li key={doc._id}><span><strong>{doc.clearanceRequirementText || doc.submissionDetails?.clearanceRequirementText || "Clearance document"}</strong><br />{doc.name || doc.documentTitle} · {doc.status} · Submitted {new Date(doc.submittedAt || doc.createdAt).toLocaleString()}</span><div className="clearance-document-row-actions">{doc.name && <button type="button" className="btn btn-outline btn-sm" onClick={() => openMedicalDocument(doc._id, doc.name).catch((openError) => setError(openError.message || "Could not open this submitted file."))}>View Submitted File</button>}{doc.status === "Pending" && ["nurse", "supervisor"].includes(String(user.role || "").toLowerCase()) && <><button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => reviewDocument(doc, "Verified")}>Accept</button><button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => reviewDocument(doc, "Rejected")}>Reject</button></>}</div></li>)}</ul> : <p>No files have been submitted for this clearance yet.</p>}</section>
        <section className="record-section"><h3>Clearance Requirements</h3><ol>{(Array.isArray(activeWorkflow.requirements) ? activeWorkflow.requirements : []).filter((item) => item?.text).map((item, index) => <li key={`${item.text}-${index}`}>{item.text}</li>)}</ol></section>
        {canUploadFromComputer && Array.isArray(activeWorkflow.requirements) && activeWorkflow.requirements.some((item) => item?.kind === "document") && <section className="record-section clearance-direct-upload"><h3>Upload Documents from This Computer</h3><p>Use this option if the kiosk or phone QR is unavailable. Each upload is added for review.</p>{!entry.student?.email && <label>Email for document status updates<input className="text-input" type="email" value={notificationEmail} onChange={(event) => setNotificationEmail(event.target.value)} /></label>}{activeWorkflow.requirements.filter((item) => item?.kind === "document").map((item, index) => {
          const upload = directUploads[item.text] || {};
          const alreadySubmitted = clearanceDocuments.some((doc) => (doc.clearanceRequirementText || doc.submissionDetails?.clearanceRequirementText) === item.text && doc.status !== "Rejected");
          return <fieldset className="clearance-direct-upload-item" key={`upload-${item.text}`} disabled={upload.saving || upload.submitted || alreadySubmitted}>
            <legend>{item.text}</legend>
            {alreadySubmitted || upload.submitted ? <p role="status">A document has been submitted for nurse review.</p> : <>
              <label>Date of examination or issue<input className="text-input" type="date" max={clinicToday()} value={upload.examDate || ""} onChange={(event) => patchDirectUpload(item.text, { examDate: event.target.value, error: "" })} /></label>
              <label>Choose file<input className="text-input" type="file" accept={ACCEPTED_UPLOADS} onChange={(event) => patchDirectUpload(item.text, { file: event.target.files?.[0] || null, error: "" })} /><small>PDF, JPG, PNG, or DOCX · Maximum 12 MB</small></label>
              {upload.file && <p>{upload.file.name}</p>}
              {upload.error && <p className="error-text" role="alert">{upload.error}</p>}
              <button type="button" className="btn btn-primary" disabled={busy || upload.saving} onClick={() => uploadRequirement(item)}>{upload.saving ? "Uploading…" : "Upload this document"}</button>
            </>}
          </fieldset>;
        })}</section>}
        {!(["approved", "completed"].includes(activeWorkflow.status)) && <section className="record-section clearance-issued-certificate"><h3>Issue Clearance Certificate</h3><p>Accept all required submitted documents, then issue the purpose-specific certificate.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={resumeCertificateApproval}>{busy ? "Issuing…" : "Issue Certificate"}</button></section>}
        {clearanceCertificate && <section className="record-section clearance-issued-certificate"><h3>Clearance Certificate</h3><p role="status">Certificate issued and saved in Documents &amp; Attachments.</p><div className="modal-actions"><button type="button" className="btn btn-primary" onClick={() => setCertificatePreview(clearanceCertificate)}>View / Print Certificate</button>{activeWorkflow.status === "approved" ? <button type="button" className="btn btn-success" disabled={busy} onClick={completeProcess}>{busy ? "Completing…" : "Complete Clearance Process"}</button> : activeWorkflow.status === "completed" ? <strong>Clearance process completed.</strong> : <button type="button" className="btn btn-secondary" disabled={busy} onClick={resumeCertificateApproval}>{busy ? "Finishing…" : "Finish Certificate Approval"}</button>}</div></section>}
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </section>
    {certificatePreview && <VerifiedClearanceCertificate certificate={certificatePreview} onClose={() => setCertificatePreview(null)} />}
  </div>;
}
