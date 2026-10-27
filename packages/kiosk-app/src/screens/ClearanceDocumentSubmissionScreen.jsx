import { useEffect, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import { getClearanceDocumentSubmission, submitClearanceKioskDocument } from "../services/api.js";
import "../styles/screens/DocumentSubmission.css";

async function encodeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function contentType(file) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })[extension] || "application/octet-stream";
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ClearanceDocumentSubmissionScreen({ token, isOnline = true }) {
  const [context, setContext] = useState(null);
  const [requirementText, setRequirementText] = useState("");
  const [examDate, setExamDate] = useState("");
  const [file, setFile] = useState(null);
  const [email, setEmail] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    getClearanceDocumentSubmission(token).then((value) => {
      if (!active) return;
      setContext(value);
      setEmail(value.student?.email || "");
      setRequirementText(value.requirements?.find((item) => item.required)?.text || value.requirements?.[0]?.text || "");
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || "This clearance document link is unavailable.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (!context || !file || !requirementText || !examDate || !privacy) {
      setError("Choose a required item, enter its examination or issue date, attach the document, and confirm the privacy notice.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Files cannot exceed the current 12 MB limit.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address for submission status updates.");
      return;
    }
    setSaving(true); setError("");
    try {
      await submitClearanceKioskDocument(token, {
        studentId: context.student.studentId || context.student.employeeId,
        notificationEmail: email.trim(),
        title: `Medical Clearance Supporting Document — ${context.purpose}`,
        category: "Diagnostic Test (Chest X-ray, ECG, Ultrasound, etc.)",
        examDate,
        clearanceRequirementText: requirementText,
        submissionDetails: { purpose: context.purpose, clearanceRequirementText: requirementText, affiliation: context.affiliation },
        name: file.name,
        contentType: contentType(file),
        fileData: await encodeFile(file),
      });
      setDone(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The document could not be uploaded. Please try again.");
    } finally { setSaving(false); }
  }

  const patientName = context?.student ? [context.student.firstName, context.student.lastName].filter(Boolean).join(" ") : "";
  return <div className="kiosk-shell document-submission-screen"><KioskHeader isOnline={isOnline} /><main className="document-submission-content">
    <p className="document-eyebrow">MEDICAL CLEARANCE</p>
    {loading ? <h1>Opening secure document submission…</h1> : error && !context ? <><h1>Clearance link unavailable</h1><p className="document-error" role="alert">{error}</p></> : done ? <div className="document-submission-success"><h1>Document submitted</h1><p>Your file for <strong>{context.purpose}</strong> is now in Medical Documents for HSO review.</p><p>The clinic will send a status update to {email}.</p></div> : <>
      <h1>Submit clearance documents</h1>
      <p className="document-intro">{patientName} · {context.purpose}</p>
      <section className="document-card"><h2>Required documents for this clearance</h2><ul>{context.requirements.map((item) => <li key={item.text}>{item.text}{item.conditional && <small> — {item.condition}</small>}</li>)}</ul></section>
      <form onSubmit={submit}><fieldset className="document-card" disabled={saving}>
        <legend>Upload a required document</legend>
        <label className="document-field-wide">Requirement<select required value={requirementText} onChange={(event) => setRequirementText(event.target.value)}><option value="">Choose a requirement</option>{context.requirements.map((item) => <option value={item.text} key={item.text}>{item.text}</option>)}</select></label>
        <label>Date of examination or issue<input required type="date" max={today()} value={examDate} onChange={(event) => setExamDate(event.target.value)} /></label>
        <label>Email for status updates<input required type="email" value={email} readOnly={Boolean(context.student.email)} onChange={(event) => setEmail(event.target.value)} />{context.student.email && <small>Using the email address on the patient's HSO-TAP record.</small>}</label>
        <label className="document-field-wide">Document file<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} /><small>PDF, JPG, PNG, or DOCX. Maximum 12 MB.</small></label>
        <label className="document-check"><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} /> I confirm that this document is genuine and may be reviewed by the Health Services Office.</label>
      </fieldset>{error && <p className="document-error" role="alert">{error}</p>}<div className="document-actions"><button type="submit" disabled={saving}>{saving ? "Uploading…" : "Submit clearance document"}</button></div></form>
    </>}
  </main></div>;
}
