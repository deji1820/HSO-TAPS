import { useEffect, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import { getClearanceDocumentSubmission, submitClearanceKioskDocument } from "../services/api.js";
import "../styles/screens/DocumentSubmission.css";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_FILES = ".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
  const [uploads, setUploads] = useState({});
  const [email, setEmail] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;
    getClearanceDocumentSubmission(token).then((value) => {
      if (!active) return;
      setContext(value);
      setEmail(value.student?.email || "");
    }).catch((requestError) => {
      if (active) setFormError(requestError.response?.data?.message || "This clearance document link is unavailable.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function updateUpload(requirement, changes) {
    setUploads((current) => ({ ...current, [requirement]: { ...current[requirement], ...changes } }));
  }

  async function submitRequirement(item) {
    const upload = uploads[item.text] || {};
    if (!context || !upload.file || !upload.examDate) {
      updateUpload(item.text, { error: "Choose this requirement's file and enter its examination or issue date." });
      return;
    }
    if (upload.file.size > MAX_FILE_SIZE) {
      updateUpload(item.text, { error: "Files cannot exceed 12 MB." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Enter a valid email address for status updates.");
      return;
    }
    if (!privacy) {
      setFormError("Confirm the privacy notice before uploading a document.");
      return;
    }

    updateUpload(item.text, { saving: true, error: "" });
    setFormError("");
    try {
      await submitClearanceKioskDocument(token, {
        studentId: context.student.studentId || context.student.employeeId,
        notificationEmail: email.trim(),
        title: "Medical Clearance Supporting Document - " + context.purpose,
        category: "Diagnostic Test (Chest X-ray, ECG, Ultrasound, etc.)",
        examDate: upload.examDate,
        clearanceRequirementText: item.text,
        submissionDetails: { purpose: context.purpose, clearanceRequirementText: item.text, affiliation: context.affiliation },
        name: upload.file.name,
        contentType: contentType(upload.file),
        fileData: await encodeFile(upload.file),
      });
      updateUpload(item.text, { saving: false, submitted: true, error: "" });
    } catch (requestError) {
      updateUpload(item.text, { saving: false, error: requestError.response?.data?.message || "This file could not be uploaded. Try again." });
    }
  }

  const patientName = context?.student ? [context.student.firstName, context.student.lastName].filter(Boolean).join(" ") : "";
  const requirements = context?.requirements || [];
  return <div className="kiosk-shell document-submission-screen clearance-document-submission"><KioskHeader isOnline={isOnline} /><main className="document-submission-content">
    <p className="document-eyebrow">MEDICAL CLEARANCE</p>
    {loading ? <h1>Opening secure document submission…</h1> : !context ? <><h1>Clearance link unavailable</h1><p className="document-error" role="alert">{formError}</p></> : <>
      <h1>Submit clearance documents</h1>
      <p className="document-intro">{patientName} · {context.purpose}</p>
      <p className="clearance-upload-instructions">Upload each document using the matching field below. Submitted files are linked to this clearance for the nurse to review.</p>
      {requirements.length ? <>
        <section className="document-card clearance-upload-contact">
          <label>Email for status updates<input required type="email" value={email} readOnly={Boolean(context.student.email)} onChange={(event) => { setEmail(event.target.value); setFormError(""); }} />{context.student.email && <small>Using the email address on the patient's HSO-TAP record.</small>}</label>
          <label className="document-check"><input type="checkbox" checked={privacy} onChange={(event) => { setPrivacy(event.target.checked); setFormError(""); }} /><span>I confirm that these documents are genuine and may be reviewed by the Health Services Office.</span></label>
        </section>
        {formError && <p className="document-error" role="alert">{formError}</p>}
        <div className="clearance-upload-list">{requirements.map((item, index) => {
          const upload = uploads[item.text] || {};
          const fileInputId = "clearance-document-" + index;
          return <fieldset className="document-card clearance-upload-form-grid clearance-upload-item" key={item.text} disabled={upload.saving || upload.submitted}>
            <legend>{item.required ? "Required document" : "Conditional document"}</legend>
            <h2>{item.text}</h2>
            {item.conditional && <p className="clearance-upload-condition">{item.condition}</p>}
            <label>Date of examination or issue<input type="date" required max={today()} value={upload.examDate || ""} onChange={(event) => updateUpload(item.text, { examDate: event.target.value, error: "" })} /></label>
            <label htmlFor={fileInputId}>Choose this document<input id={fileInputId} type="file" accept={ACCEPTED_FILES} onChange={(event) => updateUpload(item.text, { file: event.target.files?.[0] || null, error: "" })} /><small>PDF, JPG, PNG, or DOCX. Maximum 12 MB.</small></label>
            {upload.file && <p className="clearance-upload-filename">Selected file: {upload.file.name}</p>}
            {upload.error && <p className="document-error" role="alert">{upload.error}</p>}
            {upload.submitted ? <p className="clearance-upload-submitted" role="status">✓ Document submitted for nurse review.</p> : <button type="button" className="clearance-upload-submit" disabled={upload.saving || !privacy} onClick={() => submitRequirement(item)}>{upload.saving ? "Uploading…" : "Submit this document"}</button>}
          </fieldset>;
        })}</div>
      </> : <section className="document-card"><h2>No supporting documents are required</h2><p>This clearance has no document upload requirements. Follow the instructions from the Health Services Office.</p></section>}
    </>}
  </main></div>;
}
