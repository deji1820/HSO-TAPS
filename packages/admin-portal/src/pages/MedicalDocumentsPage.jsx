import { useEffect, useState } from "react";
import { getMedicalDocuments, getStudents, uploadMedicalDocument, updateMedicalDocumentStatus } from "../services/api.js";
import { openMedicalDocument } from "../utils/medicalDocuments.js";
import { normalizeRole } from "../utils/roles.js";

const STATUS_ORDER = { Pending: 0, Rejected: 1, Verified: 2, Accepted: 2 };
const statusLabel = (status) => status === "Verified" ? "Accepted" : status || "Pending";

export default function MedicalDocumentsPage() {
  const [files, setFiles] = useState([]);
  const [notice, setNotice] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patient, setPatient] = useState(null);
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [statusSortDirection, setStatusSortDirection] = useState("asc");
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const canReviewDocuments = ["nurse", "supervisor"].includes(normalizeRole(user.role));
  const sortedFiles = [...files].sort((left, right) => {
    const statusDifference = (STATUS_ORDER[left.status || "Pending"] ?? 3) - (STATUS_ORDER[right.status || "Pending"] ?? 3);
    if (statusDifference) return statusSortDirection === "asc" ? statusDifference : -statusDifference;
    return new Date(right.submittedAt || right.createdAt) - new Date(left.submittedAt || left.createdAt);
  });

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
    setSaving(true);
    setNotice("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const created = await uploadMedicalDocument(patient._id, { title: form.get("title"), category: form.get("category"), notificationEmail: form.get("notificationEmail"), name: file.name, contentType: file.type || "application/octet-stream", fileData: btoa(binary) });
      setFiles((current) => [created, ...current]);
      formElement.reset();
      setPatient(null);
      setPatientQuery("");
      setNotice(created.notificationQueued ? "Document saved as pending. The email send was started." : `Document saved as pending, but the email could not be started. ${created.notificationMessage || "Check the backend email settings."}`);
    } catch (error) {
      setNotice(error?.response?.data?.message || "Could not upload the document. Check the server connection and file size.");
    } finally { setSaving(false); }
  }

  async function updateStatus(file, status) {
    setUpdatingStatusId(file._id);
    setNotice("");
    try {
      const updated = await updateMedicalDocumentStatus(file._id, status);
      setFiles((current) => current.map((item) => item._id === file._id ? { ...item, ...updated } : item));
      setNotice(updated.notificationQueued ? `Document status changed to ${statusLabel(status)}. The email send was started.` : `Document status changed to ${statusLabel(status)}, but the email could not be started. ${updated.notificationMessage || "Check the backend email settings."}`);
    } catch (error) {
      setNotice(error?.response?.data?.message || "Could not update this document status.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  return <div className="medical-documents-page">
    <div className="page-header"><h1>Medical Documents Submission</h1></div>
    <p className="page-subtitle">Submit a medical certificate, diagnostic test, laboratory result, or other clinic document.</p>
    <form className="card medical-documents-form" onSubmit={submit}>
      <label className="field-label">Patient Name<input className="text-input" value={patient ? `${patient.firstName} ${patient.lastName}` : patientQuery} onChange={(event) => { setPatient(null); setPatientQuery(event.target.value); setNotice(""); }} placeholder="Search by student name or ID" required /></label>
      {matches.length > 0 && <div className="student-suggestions">{matches.map((match) => <button type="button" key={match._id} onClick={() => { setPatient(match); setPatientQuery(`${match.firstName} ${match.lastName}`); setMatches([]); }}>{match.firstName} {match.lastName} <small>({match.studentId})</small></button>)}</div>}
      <label className="field-label">Student school email (Outlook)<input className="text-input" name="notificationEmail" type="email" autoComplete="email" value={patient?.email || ""} onChange={(event) => setPatient((current) => current ? { ...current, email: event.target.value } : current)} required placeholder="student@school.edu" /></label>
      <label className="field-label">Document category<select className="text-input" name="category" required><option value="">Select a category</option><option>Medical certificate</option><option>Diagnostic test</option><option>Laboratory result</option><option>Other</option></select></label>
      <label className="field-label">Document title<input className="text-input" name="title" placeholder="Enter a short document title" required /></label>
      <label className="field-label">File<input className="text-input" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required /></label>
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Uploading…" : "Add Submission"}</button>
      {notice && <p role="status" className="page-subtitle">{notice}</p>}
    </form>
    <h2 className="section-title">Submission List</h2>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>File Category</th><th>Document</th><th>Purpose</th><th>Exam / Issue Date</th><th>Date Submitted</th><th>File Name</th><th aria-sort={statusSortDirection === "asc" ? "ascending" : "descending"}><button type="button" className="table-sort-button" onClick={() => setStatusSortDirection((direction) => direction === "asc" ? "desc" : "asc")}>Status <span aria-hidden="true">{statusSortDirection === "asc" ? "↑" : "↓"}</span></button></th><th>Actions</th></tr></thead><tbody>
      {sortedFiles.map((file) => <tr key={file._id}><td>{file.student ? `${file.student.firstName} ${file.student.lastName}` : file.studentName || "—"}</td><td>{file.category || "—"}</td><td>{file.documentTitle || file.title || "—"}</td><td>{file.submissionDetails?.purpose || "—"}</td><td>{file.examDate ? new Date(file.examDate).toLocaleDateString() : "—"}</td><td>{new Date(file.submittedAt || file.createdAt).toLocaleDateString()}</td><td>{file.contentType === "application/json" ? file.name?.replace(/\.json$/i, ".pdf") : file.name || "—"}</td><td>{canReviewDocuments ? <select className="text-input document-status-select" aria-label={`Change status for ${file.documentTitle || file.name || "document"}`} value={file.status || "Pending"} disabled={updatingStatusId === file._id || ["Verified", "Rejected"].includes(file.status)} onChange={(event) => updateStatus(file, event.target.value)}><option>Pending</option><option value="Verified">Accepted</option><option>Rejected</option></select> : <span className={`badge ${file.status === "Verified" ? "badge-routine" : file.status === "Rejected" ? "badge-high" : "badge-standard"}`}>{statusLabel(file.status)}</span>}</td><td>{file.name ? <div className="document-actions"><button className="btn btn-outline btn-sm" type="button" onClick={() => openMedicalDocument(file._id, file.name).catch((error) => window.alert(error.message || "Could not open this document."))}>View</button><button className="btn btn-primary btn-sm" type="button" onClick={() => openMedicalDocument(file._id, file.name, { print: true }).catch((error) => window.alert(error.message || "Could not print this document."))}>Print</button></div> : "—"}</td></tr>)}
    </tbody></table>{!files.length && <div className="table-empty">No document submissions in this browser.</div>}</div>
  </div>;
}
