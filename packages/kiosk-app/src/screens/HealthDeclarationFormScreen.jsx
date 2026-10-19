import { useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/HealthDeclarationForm.css";

const RELIGIONS = [
  "Roman Catholicism", "Islam (Sunni and Shia)", "Iglesia ni Cristo", "Evangelicalism",
  "Philippine Independent Church (Aglipayan)", "Seventh-day Adventism", "Bible Baptist Church",
  "United Church of Christ in the Philippines", "Jehovah’s Witnesses",
  "The Church of Jesus Christ of Latter-day Saints", "Jesus Is Lord Church", "Kingdom of Jesus Christ",
  "Buddhism", "Hinduism", "Sikhism", "Indigenous Folk Religions (Anitism)", "Baha'i Faith",
  "Judaism", "Atheism and Agnosticism", "Born Again Christian",
];

const ENTRY_STATUSES = [
  "Freshman (Select if Grade 11)", "Transferee", "Second-Degree Takers", "Graduate Studies",
  "Cross-enrollee", "Continuing (2nd, 3rd, 4th, or 5th Years)",
];

const MEDICAL_CONDITIONS = [
  "Psychosocial Disability (e.g., Autism, ADHD)", "Bleeding Tendencies/Disorders (e.g., Nosebleeds)",
  "Vertigo / Dizziness", "Migraine / Severe Headache", "Epilepsy / Seizure / Convulsion",
  "Panic / Anxiety Attacks", "Hyperacidity / GERD", "Heart Disease", "Asthma",
  "Sexually Transmitted Illnesses", "Congenital Heart Disease", "Immunocompromised (e.g., Cancer, Lupus, HIV)",
  "Measles (Tigdas)", "Mumps (Beke)", "Chickenpox (Bulutong)", "Hepatitis", "Scoliosis",
  "Diabetes Mellitus", "Head Injury", "Visual Defect (e.g., near/farsighted, partially blind)",
  "Hearing Defect (e.g., decreased/loss of hearing)", "Tuberculosis", "Hypertension", "G6PD",
  "Rheumatic Heart Disease", "Anemia", "I don’t have any of these conditions (Not Applicable)",
];

const HEALTH_INDICATORS = [
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

const TREATMENT_NOTICE = "I/We hereby grant permission to the nurse, physician, and dentist of the National University Health Services to render me / my son / my daughter any medical and/or dental treatment that they deem necessary as part of first aid treatment, especially during (but not limited to) emergency cases. I understand that NU Health Services will make all possible effort to inform me in the event of such treatment in an emergency.";
const TRAVEL_NOTICE = "Please declare any past medical advice against travel or health-related issues experienced during travel.";
const DECLARATION_NOTICE = "I/We hereby declare and certify that all information disclosed is true and accurate to the best of my knowledge. I/We understand that I/we may be liable for disqualification for any false declaration or concealment of information. I/We hereby authorize National University Health Services to conduct examinations necessary for assessment.\n\nI/We fully understand that the Health Services Office has limited facilities to accommodate and attend to cases; thus, should I / my son / my daughter have a pre-existing condition, I/we shall provide an updated medical clearance and coordinate with the attending physician regarding activity limitations/precautions.\n\nFurthermore, I/We hereby give my consent to National University Health Services to release results/examinations to the authorized office if necessary.";

function ageFromDate(date) {
  if (!date) return "";
  const birth = new Date(`${date}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age > 0 ? String(age) : "";
}

export default function HealthDeclarationFormScreen({ initialData, onBack, onComplete, isOnline }) {
  const [form, setForm] = useState(() => ({
    ...initialData,
    studentId: initialData.studentId || "",
    fullName: initialData.fullName || "",
    age: initialData.age || ageFromDate(initialData.dateOfBirth),
    sexAssignedAtBirth: initialData.sexAssignedAtBirth || initialData.sex || "",
    religion: "",
    homeAddress: "",
    degreeProgram: initialData.institutionalAffiliation || "",
    studentMobileNumber: "",
    entryStatus: "",
    academicYear: "",
    term: "",
    parentGuardianName: "",
    parentGuardianContactNumber: "",
    hasDisability: "",
    specifiedDisability: "",
    medicalConditions: initialData.medicalConditions || [],
    healthIndicators: Object.fromEntries(HEALTH_INDICATORS.map((question, index) => [question, initialData.healthIndicators?.[question] ?? initialData.healthIndicators?.[String(index + 1)] ?? ""])),
    treatmentConsent: "",
    treatmentSignature: "",
    travelRestrictionsOrIssues: "",
    finalDeclarationConsent: "",
    finalDeclarationSignature: "",
  }));
  const [error, setError] = useState("");

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateCondition(condition, checked) {
    setForm((current) => {
      const currentConditions = current.medicalConditions;
      const notApplicable = "I don’t have any of these conditions (Not Applicable)";
      if (condition === notApplicable && checked) return { ...current, medicalConditions: [notApplicable] };
      const withoutNotApplicable = currentConditions.filter((item) => item !== notApplicable);
      return { ...current, medicalConditions: checked ? [...withoutNotApplicable, condition] : withoutNotApplicable.filter((item) => item !== condition) };
    });
  }

  function submit(event) {
    event.preventDefault();
    if (form.medicalConditions.length === 0) {
      setError("Select a medical history option. Choose Not Applicable if none of the conditions apply.");
      return;
    }
    if (form.hasDisability === "Yes" && !form.specifiedDisability.trim()) {
      setError("Please specify the declared disability.");
      return;
    }
    setError("");
    onComplete({ ...form, submittedAt: new Date().toISOString() });
  }

  const field = (label, name, props = {}) => <label className="health-declaration-field">{label}<input value={form[name]} onChange={(event) => update(name, event.target.value)} {...props} /></label>;
  const yesNo = (label, name) => <fieldset className="health-declaration-choice"><legend>{label}</legend>{["Yes", "No"].map((option) => <label key={option}><input type="radio" name={name} value={option} checked={form[name] === option} onChange={() => update(name, option)} required />{option}</label>)}</fieldset>;
  const consentChoice = (label, name, consentText) => <fieldset className="health-declaration-choice"><legend>{label}</legend>{[consentText, "No"].map((option) => <label key={option}><input type="radio" name={name} value={option === "No" ? "No" : "Yes"} checked={form[name] === (option === "No" ? "No" : "Yes")} onChange={() => update(name, option === "No" ? "No" : "Yes")} required />{option}</label>)}</fieldset>;
  const signature = (label, name) => field(label, name, { required: true, autoComplete: "name", placeholder: "FIRST NAME, MI, LAST NAME", onChange: (event) => update(name, event.target.value.toUpperCase()) });

  return <div className="kiosk-shell health-declaration-screen">
    <KioskHeader isOnline={isOnline} />
    <main className="health-declaration-content">
      <p className="document-eyebrow">NEW STUDENT FORM</p>
      <h1>Health Status Declaration</h1>
      <p className="document-intro">Complete each section. Your answers will be attached to your medical document submission and saved to your health record.</p>
      <form onSubmit={submit}>
        <section className="health-declaration-card">
          <h2>1. Personal Information</h2>
          <div className="health-declaration-grid">
            {field("Student ID Number", "studentId", { required: true, readOnly: true, placeholder: "2026-*******" })}
            {field("Full Name (Last Name, First Name, Middle Initial)", "fullName", { required: true })}
            {field("Age", "age", { required: true, type: "number", min: 1, step: 1 })}
            <label className="health-declaration-field">Sex Assigned at Birth<select required value={form.sexAssignedAtBirth} onChange={(event) => update("sexAssignedAtBirth", event.target.value)}><option value="">Select</option><option>Male</option><option>Female</option></select></label>
            <label className="health-declaration-field">Religion<select required value={form.religion} onChange={(event) => update("religion", event.target.value)}><option value="">Select</option>{RELIGIONS.map((religion) => <option key={religion}>{religion}</option>)}</select></label>
            <label className="health-declaration-field health-declaration-wide">Home Address<textarea required rows={2} value={form.homeAddress} onChange={(event) => update("homeAddress", event.target.value)} placeholder="Complete street address, city, province" /></label>
            {field("Degree Program / Strand", "degreeProgram", { required: true, placeholder: "Example: BSTM, BSIT, STEM" })}
            {field("Student Mobile Number", "studentMobileNumber", { required: true, inputMode: "numeric", pattern: "[0-9]{11}", maxLength: 11, placeholder: "11-digit mobile number" })}
            <label className="health-declaration-field">Entry Status<select required value={form.entryStatus} onChange={(event) => update("entryStatus", event.target.value)}><option value="">Select</option>{ENTRY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
            {field("Academic Year", "academicYear", { required: true, placeholder: "AY2026-2027" })}
            <fieldset className="health-declaration-choice"><legend>Term</legend>{["Term 1", "Term 2", "Term 3"].map((term) => <label key={term}><input type="radio" name="declaration-term" value={term} checked={form.term === term} onChange={() => update("term", term)} required />{term}</label>)}</fieldset>
            {field("Parent / Guardian’s Name", "parentGuardianName", { required: true })}
            {field("Parent / Guardian’s Contact Number", "parentGuardianContactNumber", { required: true, inputMode: "numeric", pattern: "[0-9]{11}", maxLength: 11, placeholder: "11-digit mobile number" })}
          </div>
        </section>

        <section className="health-declaration-card">
          <h2>2. Disability Declaration (PWD)</h2>
          {yesNo("Are you a Person with Disability (PWD)?", "hasDisability")}
          {form.hasDisability === "Yes" && <>{field("Specified Disability", "specifiedDisability", { required: true })}<p className="health-declaration-note">If PWD, provide a copy of your medical certificate and PWD card to the Health Services Office.</p></>}
        </section>

        <section className="health-declaration-card">
          <h2>3. Medical History</h2>
          <h3>3.1 Pre-Existing &amp; Historical Conditions</h3>
          <p>Select all that apply.</p>
          <div className="health-declaration-check-grid">{MEDICAL_CONDITIONS.map((condition) => <label key={condition}><input type="checkbox" checked={form.medicalConditions.includes(condition)} onChange={(event) => updateCondition(condition, event.target.checked)} />{condition}</label>)}</div>
          <h3>3.2 Health Screen Indicators</h3>
          <div className="health-declaration-indicators">{HEALTH_INDICATORS.map((question, index) => <fieldset className="health-declaration-choice" key={question}><legend>{question}</legend>{["Yes", "No"].map((option) => <label key={option}><input type="radio" name={`health-indicator-${index}`} value={option} checked={form.healthIndicators[question] === option} onChange={() => setForm((current) => ({ ...current, healthIndicators: { ...current.healthIndicators, [question]: option } }))} required />{option}</label>)}</fieldset>)}</div>
        </section>

        <section className="health-declaration-card">
          <h2>4. Consent to Treatment Waiver</h2>
          <p className="health-declaration-notice">{TREATMENT_NOTICE}</p>
          {consentChoice("Treatment Consent Choice", "treatmentConsent", "I have read and understood the statement above and hereby give my consent.")}
          {signature("Electronic Signature (type your name in CAPITAL LETTERS)", "treatmentSignature")}
        </section>

        <section className="health-declaration-card">
          <h2>5. Travel Health Declaration Waiver</h2>
          <p className="health-declaration-notice">{TRAVEL_NOTICE}</p>
          {yesNo("Have you ever been advised not to travel by a doctor due to sickness or disability, or had an untoward health-related experience during travel?", "travelRestrictionsOrIssues")}
        </section>

        <section className="health-declaration-card">
          <h2>6. Health Status Declaration Waiver</h2>
          <p className="health-declaration-notice">{DECLARATION_NOTICE}</p>
          {consentChoice("Final Declaration Consent", "finalDeclarationConsent", "I have read, fully understood, and certify that all information provided is true and accurate. I also give my consent as stated above.")}
          {signature("Electronic Signature (type your name in CAPITAL LETTERS)", "finalDeclarationSignature")}
        </section>

        {error && <p className="document-error" role="alert">{error}</p>}
        <div className="document-actions"><button type="button" className="document-secondary" onClick={onBack}>Back to document submission</button><button type="submit">Finish health declaration</button></div>
      </form>
    </main>
  </div>;
}
