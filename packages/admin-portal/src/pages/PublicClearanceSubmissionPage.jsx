import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getPublicClearanceSubmission, submitPublicClearanceDocument } from "../services/api.js";
import "../styles/public-clearance-submission.css";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_FILES = ".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function clinicToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function fileType(file) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })[ext] || "application/octet-stream";
}

async function encodeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export default function PublicClearanceSubmissionPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [context, setContext] = useState(null);
  const [uploads, setUploads] = useState({});
  const [email, setEmail] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) { setError("This QR link is missing its secure submission token."); setLoading(false); return undefined; }
    getPublicClearanceSubmission(token).then((value) => {
      if (!active) return;
      setContext(value);
      setEmail(value.student?.email || "");
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || "This clearance link is unavailable or has expired.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function patchUpload(requirement, patch) {
    setUploads((current) => ({ ...current, [requirement]: { ...current[requirement], ...patch } }));
  }

  async function submitRequirement(requirement) {
    const upload = uploads[requirement.text] || {};
    if (!upload.file || !upload.examDate) return patchUpload(requirement.text, { error: "Choose a document and enter its examination or issue date." });
    if (upload.examDate > clinicToday()) return patchUpload(requirement.text, { error: "The examination or issue date cannot be in the future." });
    if (upload.file.size > MAX_FILE_SIZE) return patchUpload(requirement.text, { error: "Files cannot exceed 12 MB." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address for submission updates.");
    if (!privacy) return setError("Confirm the privacy notice before uploading documents.");

    patchUpload(requirement.text, { saving: true, error: "" });
    setError("");
    try {
      const patient = context.student;
      await submitPublicClearanceDocument(token, {
        studentId: patient.studentId || patient.employeeId,
        notificationEmail: email.trim(),
        title: `Medical Clearance Supporting Document - ${context.purpose}`,
        category: "Diagnostic Test (Chest X-ray, ECG, Ultrasound, etc.)",
        examDate: upload.examDate,
        clearanceRequirementText: requirement.text,
        submissionDetails: { purpose: context.purpose, clearanceRequirementText: requirement.text, affiliation: context.affiliation },
        name: upload.file.name,
        contentType: fileType(upload.file),
        fileData: await encodeFile(upload.file),
      });
      patchUpload(requirement.text, { saving: false, submitted: true, error: "", file: null });
    } catch (requestError) {
      patchUpload(requirement.text, { saving: false, error: requestError.response?.data?.message || "The document could not be uploaded. Please try again." });
    }
  }

  const patientName = context?.student ? [context.student.firstName, context.student.lastName].filter(Boolean).join(" ") : "";
  return <main className="public-clearance-page">
    <header className="public-clearance-header"><div className="public-clearance-mark">NU</div><div><span>NU FAIRVIEW · HEALTH SERVICES OFFICE</span><h1>Clearance document submission</h1></div></header>
    <div className="public-clearance-content">
      {loading ? <section className="public-clearance-card" role="status">Opening your secure submission form…</section> : !context ? <section className="public-clearance-card"><h2>Submission link unavailable</h2><p className="public-clearance-error" role="alert">{error}</p><p>Ask the Health Services Office for a new QR code if this link has expired.</p></section> : <>
        <section className="public-clearance-card public-clearance-intro"><p className="public-clearance-eyebrow">MEDICAL CLEARANCE</p><h2>{context.purpose}</h2><p>Patient: <strong>{patientName}</strong></p><p>Upload each requested document below. Your files will be sent to the Health Services Office for nurse review.</p></section>
        <section className="public-clearance-card public-clearance-contact">
          <label>Email for submission updates<input type="email" value={email} readOnly={Boolean(context.student?.email)} onChange={(event) => { setEmail(event.target.value); setError(""); }} />{context.student?.email && <small>Using the email on your HSO-TAP patient record.</small>}</label>
          <label className="public-clearance-consent"><input type="checkbox" checked={privacy} onChange={(event) => { setPrivacy(event.target.checked); setError(""); }} /><span>I confirm these documents are genuine and may be reviewed by the Health Services Office.</span></label>
        </section>
        {error && <p className="public-clearance-error" role="alert">{error}</p>}
        {context.requirements?.length ? context.requirements.map((requirement, index) => {
          const upload = uploads[requirement.text] || {};
          return <fieldset className="public-clearance-card public-clearance-requirement" key={requirement.text} disabled={upload.saving || upload.submitted}>
            <legend>{requirement.required ? "Required document" : "Conditional document"}</legend><h3>{requirement.text}</h3>
            {requirement.conditional && <p className="public-clearance-condition">{requirement.condition}</p>}
            <div className="public-clearance-fields"><label>Date of examination or issue<input type="date" max={clinicToday()} value={upload.examDate || ""} onChange={(event) => { const value = event.target.value; patchUpload(requirement.text, { examDate: value, error: value > clinicToday() ? "The date cannot be in the future." : "" }); }} /></label>
              <label htmlFor={`clearance-file-${index}`}>Choose document<input id={`clearance-file-${index}`} type="file" accept={ACCEPTED_FILES} onChange={(event) => patchUpload(requirement.text, { file: event.target.files?.[0] || null, error: "" })} /><small>PDF, JPG, PNG, or DOCX · Maximum 12 MB</small></label></div>
            {upload.file && <p className="public-clearance-filename">Selected: {upload.file.name}</p>}
            {upload.error && <p className="public-clearance-error" role="alert">{upload.error}</p>}
            {upload.submitted ? <p className="public-clearance-success" role="status">✓ Document submitted for nurse review.</p> : <button type="button" className="public-clearance-submit" disabled={upload.saving || !privacy} onClick={() => submitRequirement(requirement)}>{upload.saving ? "Uploading…" : "Submit this document"}</button>}
          </fieldset>;
        }) : <section className="public-clearance-card"><h3>No supporting documents are required</h3><p>Contact the Health Services Office if you believe this is incorrect.</p></section>}
      </>}
      <footer className="public-clearance-footer">Secure submission for NU Fairview Health Services Office</footer>
    </div>
  </main>;
}
