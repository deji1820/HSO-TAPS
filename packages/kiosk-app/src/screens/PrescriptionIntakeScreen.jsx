import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/WalkInConsultation.css";

const SYMPTOMS = [
  "Fever / Chills", "Headache", "Minor Injury", "Others",
  "Stomachache", "Allergy", "Menstrual Cramps",
];

const SAFETY_QUESTIONS = [
  { id: "allergies", text: "Do you have any known ALLERGIES to medicines (e.g., Paracetamol, NSAIDs)?", yes: "YES, I have allergies", no: "NO allergies" },
  { id: "painMedicine", text: "Have you taken any pain reliever/medication in the last 4 to 6 hours?", yes: "YES", no: "NO" },
  { id: "recentMeal", text: "Have you eaten a meal or snack in the last 2 hours? (Important for pain meds)", yes: "YES", no: "NO" },
];

export default function PrescriptionIntakeScreen({
  selectedSymptoms,
  safetyAnswers,
  temperatureC,
  mobileMode = false,
  onTemperatureChange,
  sensorFailed = false,
  onRetry,
  onToggleSymptom,
  otherText = "",
  onOtherTextChange,
  onAnswerSafety,
  onContinue,
  onBack,
  isOnline,
}) {
  const temperature = temperatureC == null ? null : Number(temperatureC);
  const tempClass = temperature == null ? null : temperature < 35.5 ? "Hypothermia" : temperature >= 37.8 ? "Fever" : "Normal";
  const canContinue = (mobileMode || temperature != null) && selectedSymptoms.length > 0 && (!selectedSymptoms.includes("Others") || otherText.trim().length > 0) && SAFETY_QUESTIONS.every((question) => safetyAnswers[question.id] != null);

  return (
    <div className="kiosk-shell wic-screen med-screen">
      <KioskHeader isOnline={isOnline} />
      <main className="med-content">
        <div className="med-policy-banner">
          For available over-the-counter (OTC) medications, the HSO shall dispense or administer only the initial dose when deemed appropriate following assessment. Succeeding doses, when necessary, shall be determined on a case-to-case basis, taking into consideration the patient’s condition, assessment findings, applicable medication guidance, and any prescription or direction from the attending healthcare provider.
        </div>

        <div className="med-heading">
          <p>SERVICE: PRESCRIPTION &amp; MEDICINE</p>
          <h1>Please select your symptoms and safety details</h1>
        </div>

        <section className="med-panel">
          <h2>CHIEF COMPLAINT SELECTION</h2>
          <p className="med-hint">Choose your primary health concern or symptoms. Select all that applies.</p>
          <div className="med-symptoms">
            {SYMPTOMS.map((symptom) => (
              <label key={symptom}>
                <input type="checkbox" checked={selectedSymptoms.includes(symptom)} onChange={() => onToggleSymptom(symptom)} />
                {symptom}
              </label>
            ))}
          </div>
          {selectedSymptoms.includes("Others") && <label className="wic-other-entry">Please specify
            <input value={otherText} onChange={(event) => onOtherTextChange?.(event.target.value)} placeholder="Describe your concern" maxLength={200} />
          </label>}
        </section>

        {sensorFailed && <div className="wic-sensor-recovery" role="alert"><p>We couldn't get a temperature reading. Retry the sensor or go back to service selection.</p><button type="button" onClick={onRetry}>Retry temperature scan</button></div>}

        <section className="med-panel med-safety-panel">
          <h2>PATIENT SAFETY SCREENING</h2>
          <p className="med-instruction">Please answer the following safety questions before proceeding</p>
          {SAFETY_QUESTIONS.map((question, index) => (
            <fieldset className="med-question" key={question.id}>
              <legend>{index + 1}. {question.text}</legend>
              <div className="med-answer-row">
                <label><input type="radio" name={question.id} checked={safetyAnswers[question.id] === "yes"} onChange={() => onAnswerSafety(question.id, "yes")} />{question.yes}</label>
                <label><input type="radio" name={question.id} checked={safetyAnswers[question.id] === "no"} onChange={() => onAnswerSafety(question.id, "no")} />{question.no}</label>
              </div>
            </fieldset>
          ))}
        </section>

        <section className="med-panel med-vitals-panel">
          <h2>MANDATORY VITAL SIGNS INTAKE</h2>
          <p className="med-instruction">Please position your right wrist in front of the temperature sensor and your left arm into the blood pressure cuff to acquire your vital signs</p>
          <div className="med-vital-row"><strong>Temperature:</strong>{mobileMode ? <div className="mobile-optional-reading"><input aria-label="Optional temperature reading in degrees Celsius" type="number" inputMode="decimal" min="25" max="45" step="0.1" value={temperature ?? ""} onChange={(event) => onTemperatureChange?.(event.target.value === "" ? null : Number(event.target.value))} placeholder="Optional °C reading" /><small>Optional — enter a reading provided by clinic staff.</small></div> : <span className={tempClass && tempClass !== "Normal" ? "med-abnormal" : ""}>{temperature == null ? "<<temperature in degrees celcius>>  <<classification>>" : `${temperature.toFixed(1)}°C  ${tempClass}`}</span>}</div>
          <div className="med-vital-row"><strong>Blood Pressure:</strong><span>&lt;systolic/diastolic pressure in mmHg&gt;  &lt;classification&gt;</span></div>
        </section>

        <div className="med-actions">
          <button className="wic-back-btn" onClick={onBack}>&lt;&lt; Back</button>
          <button className="med-proceed" onClick={onContinue} disabled={!canContinue}>Proceed &gt;&gt;</button>
        </div>
      </main>
    </div>
  );
}
