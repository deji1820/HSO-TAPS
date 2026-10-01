import { useEffect, useState } from "react";
import { getMedicalDocuments, getStudents, uploadMedicalDocument } from "../services/api.js";

export default function MedicalDocumentsPage() {
  const [files, setFiles] = useState([]);
  const [notice, setNotice] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patient, setPatient] = useState(null);
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);

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
      const created = await uploadMedicalDocument(patient._id, { title: form.get("title"), category: form.get("category"), name: file.name, contentType: file.type || "application/octet-stream", fileData: btoa(binary) });
      setFiles((current) => [created, ...current]);
      formElement.reset();
      setPatient(null);
      setPatientQuery("");
      setNotice("Document uploaded and saved to the server.");
    } catch (error) {
      setNotice(error?.response?.data?.message || "Could not upload the document. Check the server connection and file size.");
    } finally { setSaving(false); }
  }

  return <div className="medical-documents-page">
    <div className="page-header"><h1>Medical Documents Submission</h1></div>
    <p className="page-subtitle">Submit a medical certificate, diagnostic test, laboratory result, or other clinic document.</p>
    <form className="card medical-documents-form" onSubmit={submit}>
      <label className="field-label">Patient Name<input className="text-input" value={patient ? `${patient.firstName} ${patient.lastName}` : patientQuery} onChange={(event) => { setPatient(null); setPatientQuery(event.target.value); setNotice(""); }} placeholder="Search by student name or ID" required /></label>
      {matches.length > 0 && <div className="student-suggestions">{matches.map((match) => <button type="button" key={match._id} onClick={() => { setPatient(match); setPatientQuery(`${match.firstName} ${match.lastName}`); setMatches([]); }}>{match.firstName} {match.lastName} <small>({match.studentId})</small></button>)}</div>}
      <label className="field-label">Document category<select className="text-input" name="category" required><option value="">Select a category</option><option>Medical certificate</option><option>Diagnostic test</option><option>Laboratory result</option><option>Other</option></select></label>
      <label className="field-label">Document title<input className="text-input" name="title" placeholder="Enter a short document title" required /></label>
      <label className="field-label">File<input className="text-input" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required /></label>
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Uploading…" : "Add Submission"}</button>
      {notice && <p role="status" className="page-subtitle">{notice}</p>}
    </form>
    <h2 className="section-title">Submission List</h2>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>File Category</th><th>Document</th><th>Date Submitted</th><th>File Name</th></tr></thead><tbody>
      {files.map((file) => <tr key={file._id}><td>{file.student ? `${file.student.firstName} ${file.student.lastName}` : file.studentName || "—"}</td><td>{file.category}</td><td>{file.documentTitle || file.title}</td><td>{new Date(file.submittedAt || file.createdAt).toLocaleDateString()}</td><td>{file.name}</td></tr>)}
    </tbody></table>{!files.length && <div className="table-empty">No document submissions in this browser.</div>}</div>
  </div>;
}
