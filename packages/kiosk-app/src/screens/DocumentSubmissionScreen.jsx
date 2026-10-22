import { useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import { lookupStudent, submitKioskDocument } from "../services/api.js";
import { DOCUMENT_PURPOSES, DOCUMENT_PURPOSE_REQUIREMENTS } from "../data/documentPurposes.js";
import HealthDeclarationFormScreen from "./HealthDeclarationFormScreen.jsx";
import "../styles/screens/DocumentSubmission.css";


const DOCUMENT_TYPES = [
  "Medical Certificate / Clearance",
  "Diagnostic Test (Chest X-ray, ECG, Ultrasound, etc.)",
  "Laboratory Test (CBC, urinalysis, lipid profile, etc.)",
  "Other",
];
const HEALTH_DECLARATION_TYPE = "Health Status Declaration Form";

async function encodeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fileContentType(file) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })[extension] || "application/octet-stream";
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DocumentSubmissionScreen({ initialStudent = null, onBack, onDone, isOnline = true }) {
  const [student, setStudent] = useState(initialStudent);
  const [studentId, setStudentId] = useState(initialStudent?.studentId || "");
  const [notificationEmail, setNotificationEmail] = useState(initialStudent?.email || "");
  const [affiliation, setAffiliation] = useState("Student");
  const [fullName, setFullName] = useState(initialStudent ? [initialStudent.lastName, initialStudent.firstName, initialStudent.middleName].filter(Boolean).join(", ") : "");
  const [sex, setSex] = useState(initialStudent?.sex || "");
  const [dateOfBirth, setDateOfBirth] = useState(initialStudent?.dateOfBirth?.slice?.(0, 10) || "");
  const [institutionalAffiliation, setInstitutionalAffiliation] = useState(initialStudent?.program || "");
  const [purpose, setPurpose] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [healthDeclaration, setHealthDeclaration] = useState(null);
  const [showHealthDeclaration, setShowHealthDeclaration] = useState(false);
  const [otherType, setOtherType] = useState("");
  const [examDate, setExamDate] = useState("");
  const [files, setFiles] = useState([]);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [mediaConsent, setMediaConsent] = useState("I consent to internal reporting only (do not use my identifiable image publicly)");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [verified, setVerified] = useState(Boolean(initialStudent));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [emailNoticeSent, setEmailNoticeSent] = useState(false);
  const latestAllowedDateOfBirth = localDateInputValue();

  async function verifyIdentity(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const found = await lookupStudent(studentId.trim());
      setStudent(found);
      setNotificationEmail(found.email || "");
      setFullName([found.lastName, found.firstName, found.middleName].filter(Boolean).join(", "));
      setSex(found.sex || "");
      setDateOfBirth(found.dateOfBirth?.slice?.(0, 10) || "");
      setInstitutionalAffiliation(affiliation === "Student" ? found.program || "" : found.department || "");
      setVerified(true);
    } catch (lookupError) {
      setError(lookupError?.response?.data?.message || "We couldn't verify that ID. Check the number or ask clinic staff for help.");
      setStudent(null);
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }

  function updateFiles(event) {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 10) {
      setError("The system notes allow up to 10 files per submission.");
      event.target.value = "";
      return;
    }
    const tooLarge = selected.find((file) => file.size > 12 * 1024 * 1024);
    if (tooLarge) {
      setError(`${tooLarge.name} is over the current 12 MB upload limit. The system notes list 1 GB per file, but the existing server does not support that size.`);
      event.target.value = "";
      return;
    }
    setError("");
    setFiles(selected);
  }

  async function submit(event) {
    event.preventDefault();
    if (!student?._id || !verified) {
      setError("Verify your student or employee ID before submitting.");
      return;
    }
    const isHealthDeclaration = documentType === HEALTH_DECLARATION_TYPE;
    if (!privacyAccepted || !declarationAccepted || (!isHealthDeclaration && files.length === 0)) {
      setError(isHealthDeclaration ? "Confirm the privacy and declaration notices." : "Confirm the privacy notice and document declaration, and attach at least one file.");
      return;
    }
    if (isHealthDeclaration && !healthDeclaration) {
      setError("Complete the Health Status Declaration Form before submitting.");
      return;
    }
    if (dateOfBirth > latestAllowedDateOfBirth) {
      setError("Date of birth cannot be in the future.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail.trim())) {
      setError("Enter a valid email address so we can send your submission status.");
      return;
    }
    if (!fullName.trim() || !sex || !dateOfBirth || !institutionalAffiliation.trim() || !purpose || !documentType || (!isHealthDeclaration && !examDate) || (documentType === "Other" && !otherType.trim())) {
      setError("Complete all required identity and document details.");
      return;
    }

    setLoading(true);
    setError("");
    let uploaded = 0;
    let allNotificationsSent = true;
    const submissionDetails = {
      fullName: fullName.trim(), sex, dateOfBirth, affiliation,
      institutionalAffiliation: institutionalAffiliation.trim(),
      studentOrEmployeeId: studentId.trim(), purpose, examDate,
      privacyAccepted, mediaConsent, declarationAccepted,
    };
    try {
      if (isHealthDeclaration) {
        const file = new File([JSON.stringify(healthDeclaration, null, 2)], "Health_Status_Declaration.json", { type: "application/json" });
        setProgress("Saving your health declaration...");
        const result = await submitKioskDocument({
          studentId: student.studentId || studentId.trim(),
          notificationEmail: notificationEmail.trim(),
          title: HEALTH_DECLARATION_TYPE,
          category: HEALTH_DECLARATION_TYPE,
          examDate: localDateInputValue(),
          submissionDetails: { ...submissionDetails, healthDeclaration },
          name: file.name,
          contentType: "application/json",
          fileData: await encodeFile(file),
        });
        allNotificationsSent = allNotificationsSent && result.notificationSent;
        uploaded += 1;
      } else {
      for (const file of files) {
        setProgress(`Uploading ${uploaded + 1} of ${files.length}: ${file.name}`);
        const result = await submitKioskDocument({
          studentId: student.studentId || studentId.trim(),
          notificationEmail: notificationEmail.trim(),
          title: `Medical Document Submission — ${purpose}`,
          category: documentType === "Other" ? `Other: ${otherType.trim()}` : documentType,
          examDate,
          submissionDetails,
          name: file.name,
          contentType: fileContentType(file),
          fileData: await encodeFile(file),
        });
        allNotificationsSent = allNotificationsSent && result.notificationSent;
        uploaded += 1;
      }
      }
      setProgress(isHealthDeclaration ? "Health declaration submitted." : `${uploaded} file${uploaded === 1 ? "" : "s"} submitted.`);
      setEmailNoticeSent(allNotificationsSent);
      setCompleted(true);
    } catch (uploadError) {
      const message = uploadError?.response?.data?.message || uploadError?.message || "Upload failed.";
      setError(uploaded ? `${uploaded} file(s) were saved. The next file failed: ${message}` : message);
    } finally {
      setLoading(false);
    }
  }

  if (showHealthDeclaration) return <HealthDeclarationFormScreen
    initialData={healthDeclaration || { studentId: student?.studentId || studentId.trim(), fullName, sex, dateOfBirth, institutionalAffiliation }}
    onBack={() => setShowHealthDeclaration(false)}
    onComplete={(data) => { setHealthDeclaration(data); setShowHealthDeclaration(false); setError(""); }}
    isOnline={isOnline}
  />;

  if (completed) return <div className="kiosk-shell document-submission-screen"><KioskHeader isOnline={isOnline} /><main className="document-submission-content document-submission-success"><p className="document-eyebrow">DOCUMENT SUBMISSION</p><h1>Submission received</h1><p>{progress} Your documents have been added to your health record for clinic review.</p><p>{emailNoticeSent ? `A pending status email was sent to ${notificationEmail}.` : "Your documents were saved, but the pending email could not be sent. Please contact the Health Services Office."}</p><button type="button" onClick={onDone}>Done</button></main></div>;

  return <div className="kiosk-shell document-submission-screen">
    <KioskHeader isOnline={isOnline} />
    <main className="document-submission-content">
      <p className="document-eyebrow">HEALTH SERVICES OFFICE</p>
      <h1>Medical document submission</h1>
      <p className="document-intro">Submit medical certificates, clearance records, diagnostic results, laboratory results, or other medical files for your EMR.</p>

      <section className="document-card">
        <h2>1. Identify yourself</h2>
        {!verified ? <form className="document-identity-verify" onSubmit={verifyIdentity}>
          <label>Student ID or Employee ID<input required value={studentId} onChange={(event) => setStudentId(event.target.value)} autoComplete="off" /></label>
          <button type="submit" disabled={loading}>{loading ? "Checking…" : "Verify ID"}</button>
        </form> : <p className="document-verified">Verified: {studentId}</p>}
      </section>

      <form onSubmit={submit}>
        <fieldset className="document-card" disabled={!verified || loading}>
          <legend>Personal and institution details</legend>
          <div className="document-form-grid">
            <label>Affiliation<select value={affiliation} onChange={(event) => { setAffiliation(event.target.value); setPurpose(""); setInstitutionalAffiliation(""); setDocumentType(""); setHealthDeclaration(null); setFiles([]); }}><option>Student</option><option>Employee</option></select></label>
            <label>Student ID / Employee ID<input required value={studentId} onChange={(event) => { setStudentId(event.target.value); setVerified(false); }} /></label>
            <label className="document-field-wide">Full name (Last Name, First Name, Middle Initial)<input required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
            <label className="document-field-wide">School email address<input required type="email" autoComplete="email" value={notificationEmail} onChange={(event) => setNotificationEmail(event.target.value)} /><small>Status notices will be sent to this address and delivered to your Outlook inbox. We’ll save it for your next document submission.</small></label>
            <label>Sex assigned at birth<select required value={sex} onChange={(event) => setSex(event.target.value)}><option value="">Select</option><option>Male</option><option>Female</option></select></label>
            <label>Date of birth<input required type="date" max={latestAllowedDateOfBirth} value={dateOfBirth} onChange={(event) => { setDateOfBirth(event.target.value); setError(""); }} /></label>
            <label>{affiliation === "Student" ? "Academic program / grade level" : "Department"}<input required value={institutionalAffiliation} onChange={(event) => setInstitutionalAffiliation(event.target.value)} /></label>
            <label className="document-field-wide">Purpose<select required value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value="">Select the reason for submitting</option>{DOCUMENT_PURPOSES[affiliation].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          {purpose && <div className="document-requirements"><h3>Requirements for this purpose</h3><ul>{(DOCUMENT_PURPOSE_REQUIREMENTS[purpose] || []).map((item) => <li key={item}>{item}</li>)}</ul></div>}
        </fieldset>

        <fieldset className="document-card" disabled={!verified || loading}>
          <legend>2. Medical document details</legend>
          <div className="document-form-grid">
            <label>Document type<select required value={documentType} onChange={(event) => { setDocumentType(event.target.value); setHealthDeclaration(null); }}><option value="">Select type</option>{DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}{affiliation === "Student" && <option>{HEALTH_DECLARATION_TYPE}</option>}</select></label>
            {documentType === "Other" && <label>Specify document type<input required value={otherType} onChange={(event) => setOtherType(event.target.value)} /></label>}
            {documentType !== HEALTH_DECLARATION_TYPE && <label>Date of examination, test, or issuance<input required type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></label>}
            {documentType === HEALTH_DECLARATION_TYPE ? <div className="document-field-wide"><p>Complete the health information on a separate page, then return here to submit it to your health record.</p><button type="button" onClick={() => setShowHealthDeclaration(true)}>{healthDeclaration ? "Review or edit health declaration" : "Proceed to Health Status Declaration Form"}</button>{healthDeclaration && <span className="document-verified">Form completed and ready to submit</span>}</div> : <label className="document-field-wide">Upload medical document(s)<input required type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={updateFiles} /><small>PDF, JPG, PNG, or DOCX. Name files LastName_FirstName. Up to 10 files. Current system limit: 12 MB per file.</small>{files.length > 0 && <span>{files.length} file(s) selected</span>}</label>}
          </div>
        </fieldset>

        <fieldset className="document-card" disabled={!verified || loading}>
          <legend>3. Privacy and declaration</legend>
          <p className="document-privacy-note">Your information is used by the Health Services Office to support health and safety. The system notes state five-year retention in AWS; this system currently saves uploads in MongoDB Atlas. Please contact HSO if you need clarification about the storage or retention policy.</p>
          <label className="document-check"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /> I confirm I have read the data privacy notice and agree to proceed.</label>
          <label className="document-consent">Optional media consent<select value={mediaConsent} onChange={(event) => setMediaConsent(event.target.value)}><option>I consent to both internal reporting and public use (social media/newsletters)</option><option>I consent to internal reporting only (do not use my identifiable image publicly)</option></select></label>
          <label className="document-check"><input type="checkbox" checked={declarationAccepted} onChange={(event) => setDeclarationAccepted(event.target.checked)} /> {documentType === HEALTH_DECLARATION_TYPE ? "I confirm the health declaration is complete and the information provided is accurate." : "I confirm these details are accurate and the uploaded documents are genuine and unmodified."}</label>
        </fieldset>

        {error && <p className="document-error" role="alert">{error}</p>}
        {progress && <p className="document-progress" aria-live="polite">{progress}</p>}
        <div className="document-actions"><button type="button" className="document-secondary" onClick={onBack || (() => window.location.assign(window.location.pathname))} disabled={loading}>Back / Cancel</button><button type="submit" disabled={loading || !verified}>{loading ? "Submitting…" : "Submit documents"}</button></div>
      </form>
    </main>
  </div>;
}
