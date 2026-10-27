import { useEffect, useState } from "react";
import { getMedicalDocuments, getStudents, uploadMedicalDocument, updateMedicalDocumentStatus } from "../services/api.js";
import { openMedicalDocument } from "../utils/medicalDocuments.js";
import { normalizeRole } from "../utils/roles.js";
import VerifiedClearanceCertificate from "../components/VerifiedClearanceCertificate.jsx";
import { appDialog } from "../../../shared-ui/src/dialogService.js";

const statusLabel = (status) => status === "Verified" ? "Accepted" : status || "Pending";

function CertificateAction({ certificate, label = "View / Print Certificate" }) {
  const [open, setOpen] = useState(false);
  return certificate ? <><button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>{label}</button>{open && <VerifiedClearanceCertificate certificate={certificate} onClose={() => setOpen(false)} />}</> : null;
}

function SubmissionTable({ files, canReviewDocuments, updatingStatusId, updateStatus, retryCertificate, emptyMessage }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>File Category</th><th>Document</th><th>Purpose</th><th>Exam / Issue Date</th><th>Date Submitted</th><th>File Name</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {files.map((file) => <tr key={file._id}><td>{file.student ? `${file.student.firstName} ${file.student.lastName}` : file.studentName || "—"}</td><td>{file.category || "—"}</td><td>{file.documentTitle || file.title || "—"}</td><td>{file.submissionDetails?.purpose || file.submissionDetails?.clearance?.purpose || "—"}</td><td>{file.examDate ? new Date(file.examDate).toLocaleDateString() : "—"}</td><td>{new Date(file.submittedAt || file.createdAt).toLocaleDateString()}</td><td>{file.contentType === "application/json" ? file.name?.replace(/\.json$/i, ".pdf") : file.name || "—"}</td><td>{canReviewDocuments && file.status === "Pending" && file.recordType !== "clearance_certificate" ? <select className="text-input document-status-select" aria-label={`Change status for ${file.documentTitle || file.name || "document"}`} value="Pending" disabled={updatingStatusId === file._id} onChange={(event) => updateStatus(file, event.target.value)}><option>Pending</option><option value="Verified">Accepted</option><option>Rejected</option></select> : <span className={`badge ${file.status === "Verified" || file.status === "Issued" ? "badge-routine" : file.status === "Rejected" ? "badge-high" : "badge-standard"}`}>{file.status === "Issued" ? "Certificate Issued" : statusLabel(file.status)}</span>}</td><td><div className="document-actions">{file.recordType === "clearance_certificate" ? <CertificateAction certificate={file} /> : file.issuedCertificate ? <CertificateAction certificate={file.issuedCertificate} /> : canReviewDocuments && file.clearanceCertificateEligible && file.status === "Verified" && <button type="button" className="btn btn-outline btn-sm" disabled={updatingStatusId === file._id} onClick={() => retryCertificate(file)}>Generate Clearance</button>}{file.recordType !== "clearance_certificate" && file.name && <button className="btn btn-secondary btn-sm" type="button" onClick={() => openMedicalDocument(file._id, file.name).catch((error) => appDialog.alert(error.message || "Could not open the submitted file."))}>View Submitted File</button>}</div></td></tr>)}
  </tbody></table>{!files.length && <div className="table-empty">{emptyMessage}</div>}</div>;
}

export default function MedicalDocumentsPage() {
  const [section, setSection] = useState("pending");
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [files, setFiles] = useState([]);
  const [notice, setNotice] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patient, setPatient] = useState(null);
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const canReviewDocuments = ["nurse", "supervisor"].includes(normalizeRole(user.role));
  const visibleFiles = files.filter((file) => !(file.recordType === "clearance_certificate" && file.sourceDocument));
  const pendingFiles = visibleFiles.filter((file) => (file.status || "Pending") === "Pending").sort(newestFirst);
  const reviewedFiles = visibleFiles.filter((file) => ["Verified", "Rejected"].includes(file.status));
  const archiveFiles = reviewedFiles.filter((file) => archiveFilter === "all" || (archiveFilter === "accepted" ? file.status === "Verified" : file.status === "Rejected")).sort(newestFirst);

  useEffect(() => { getMedicalDocuments().then(setFiles).catch(() => setNotice("Could not load submitted documents from the server.")); }, []);
  useEffect(() => {
    if (patientQuery.trim().length < 2 || patient) { setMatches([]); return undefined; }
    const timer = setTimeout(() => getStudents(patientQuery.trim()).then(setMatches).catch(() => setMatches([])), 250);
    return () => clearTimeout(timer);
  }, [patientQuery, patient]);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!patient) return setNotice("Search for and select the patient for this document.");
    if (!file?.name) return setNotice("Choose a file to continue.");
    if (file.size > 12 * 1024 * 1024) return setNotice("Files must be 12 MB or smaller.");
    const formElement = event.currentTarget;
    setSaving(true); setNotice("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const created = await uploadMedicalDocument(patient._id, { title: form.get("title"), category: form.get("category"), examDate: form.get("examDate"), notificationEmail: form.get("notificationEmail"), name: file.name, contentType: file.type || "application/octet-stream", fileData: btoa(binary) });
      setFiles((current) => [created, ...current]);
      formElement.reset(); setPatient(null); setPatientQuery(""); setSection("pending");
      setNotice(created.notificationQueued ? "Document saved as pending. The email send was started." : `Document saved as pending, but the email could not be started. ${created.notificationMessage || "Check the backend email settings."}`);
    } catch (error) {
      setNotice(error?.response?.data?.message || "Could not upload the document. Check the server connection and file size.");
    } finally { setSaving(false); }
  }

  async function updateStatus(file, status) {
    const decisionRemark = await appDialog.prompt(`Add a brief ${status === "Verified" ? "acceptance" : "rejection"} remark:`, "", status === "Verified" ? "Accept document" : "Reject document");
    if (decisionRemark === null) return;
    const remarks = decisionRemark.trim();
    if (remarks.length < 3) { setNotice("Add a remark with at least 3 characters before saving this decision."); return; }
    setUpdatingStatusId(file._id); setNotice("");
    try {
      const updated = await updateMedicalDocumentStatus(file._id, status, remarks);
      setFiles((current) => current.map((item) => item._id === file._id ? { ...item, ...updated, issuedCertificate: updated.issuedCertificate || item.issuedCertificate } : item));
      setNotice(updated.notificationQueued ? `Document status changed to ${statusLabel(status)}. The email send was started.` : `Document status changed to ${statusLabel(status)}, but the email could not be started. ${updated.notificationMessage || "Check the backend email settings."}`);
    } catch (error) { setNotice(error?.response?.data?.message || "Could not update this document status."); }
    finally { setUpdatingStatusId(null); }
  }

  async function retryCertificate(file) {
    setUpdatingStatusId(file._id); setNotice("");
    try {
      const updated = await updateMedicalDocumentStatus(file._id, "Verified", "Certificate generation retry after existing verification.");
      setFiles((current) => current.map((item) => item._id === file._id ? { ...item, ...updated, issuedCertificate: updated.issuedCertificate || item.issuedCertificate } : item));
      setNotice(updated.issuedCertificate ? "Purpose-specific clearance certificate generated." : "This verified document is not eligible for an automatic clearance certificate.");
    } catch (error) { setNotice(error?.response?.data?.message || "Could not generate the clearance certificate."); }
    finally { setUpdatingStatusId(null); }
  }

  return <div className="medical-documents-page">
    <div className="page-header"><h1>Medical Documents</h1></div>
    <p className="page-subtitle">Review pending submissions, add a document, or browse the accepted and rejected archive.</p>
    <nav className="document-section-tabs" aria-label="Medical document sections">
      <button type="button" className={section === "pending" ? "active" : ""} aria-current={section === "pending" ? "page" : undefined} onClick={() => setSection("pending")}>Pending <span>{pendingFiles.length}</span></button>
      <button type="button" className={section === "add" ? "active" : ""} aria-current={section === "add" ? "page" : undefined} onClick={() => setSection("add")}>Add</button>
      <button type="button" className={section === "archive" ? "active" : ""} aria-current={section === "archive" ? "page" : undefined} onClick={() => setSection("archive")}>Archive <span>{reviewedFiles.length}</span></button>
    </nav>
    {notice && <p role="status" className="page-subtitle">{notice}</p>}
    {section === "add" && <>
      <p className="page-subtitle">Submit a medical certificate, diagnostic test, laboratory result, or other clinic document.</p>
      <form className="card medical-documents-form" onSubmit={submit}>
        <label className="field-label">Patient Name<input className="text-input" value={patient ? `${patient.firstName} ${patient.lastName}` : patientQuery} onChange={(event) => { setPatient(null); setPatientQuery(event.target.value); setNotice(""); }} placeholder="Search by student name or ID" required /></label>
        {matches.length > 0 && <div className="student-suggestions">{matches.map((match) => <button type="button" key={match._id} onClick={() => { setPatient(match); setPatientQuery(`${match.firstName} ${match.lastName}`); setMatches([]); }}>{match.firstName} {match.lastName} <small>({match.studentId})</small></button>)}</div>}
        <label className="field-label">Student school email (Outlook)<input className="text-input" name="notificationEmail" type="email" autoComplete="email" value={patient?.email || ""} onChange={(event) => setPatient((current) => current ? { ...current, email: event.target.value } : current)} required placeholder="student@school.edu" /></label>
        <label className="field-label">Document category<select className="text-input" name="category" required><option value="">Select a category</option><option>Medical certificate</option><option>Diagnostic test</option><option>Laboratory result</option><option>Other</option></select></label>
        <label className="field-label">Document title<input className="text-input" name="title" placeholder="Enter a short document title" required /></label>
        <label className="field-label">Date of examination, test, or issuance<input className="text-input" name="examDate" type="date" max={new Date().toISOString().slice(0, 10)} required /></label>
        <label className="field-label">File<input className="text-input" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required /></label>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Uploading…" : "Add Submission"}</button>
      </form>
    </>}
    {section === "pending" && <><h2 className="section-title">Pending Submissions</h2><SubmissionTable files={pendingFiles} canReviewDocuments={canReviewDocuments} updatingStatusId={updatingStatusId} updateStatus={updateStatus} retryCertificate={retryCertificate} emptyMessage="No pending document submissions." /></>}
    {section === "archive" && <><div className="document-archive-header"><h2 className="section-title">Reviewed Submissions</h2><label>Filter archive<select className="text-input" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)}><option value="all">Accepted and rejected</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></label></div><SubmissionTable files={archiveFiles} canReviewDocuments={canReviewDocuments} updatingStatusId={updatingStatusId} updateStatus={updateStatus} retryCertificate={retryCertificate} emptyMessage={archiveFilter === "all" ? "No accepted or rejected submissions yet." : `No ${archiveFilter} submissions.`} /></>}
  </div>;
}

function newestFirst(a, b) { return new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt); }
