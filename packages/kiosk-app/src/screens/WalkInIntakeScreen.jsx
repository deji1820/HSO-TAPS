import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/WalkInConsultation.css";

export const COMPLAINTS = [
  { key: "fever_chills", label: "Fever / Chills" },
  { key: "headache", label: "Headache" },
  { key: "cough_cold", label: "Cough / Cold" },
  { key: "others", label: "Others" },
  { key: "stomachache", label: "Stomachache" },
  { key: "dizziness", label: "Dizziness" },
  { key: "minor_injury", label: "Minor Injury" },
];

// Per HSO-TAP_SYSTEM_NOTES: Hypothermia < 35.5, Normal 35.5-37.5, Fever >= 37.8
// (37.6-37.7 is undefined in the notes; treated as Normal). Keep in sync with
// server/src/controllers/kiosk.controller.js
const HYPOTHERMIA_BELOW_C = 35.5;
const FEVER_AT_OR_ABOVE_C = 37.8;

export function classifyTemp(tempC) {
  if (tempC == null) return null;
  if (tempC < HYPOTHERMIA_BELOW_C) return "Hypothermia";
  if (tempC >= FEVER_AT_OR_ABOVE_C) return "Fever";
  return "Normal";
}

export default function WalkInIntakeScreen({
  consultSubType,        // "Medical" | "Dental"
  selectedComplaints,    // array of keys, lifted state
  onToggleComplaint,     // (key) => void
  temperatureC,          // number | null, from sensor
  onContinue,            // () => void
  onBack,
  onFaq,
  isOnline,
}) {
  const tempClass = classifyTemp(temperatureC);
  const isAbnormal = tempClass != null && tempClass !== "Normal";
  const canContinue = temperatureC != null && selectedComplaints.length > 0;

  return (
    <div className="kiosk-shell wic-screen wic-screen--intake">
      <KioskHeader isOnline={isOnline} />
      <main className="wic-content">
        <div className="wic-heading-block">
          <p className="wic-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION &gt; WALK-IN CONSULTATION</p>
          <h1 className="wic-heading">Please complete your initial intake</h1>
        </div>

        <div className="wic-panel">
          <p className="wic-panel-title">CHIEF COMPLAINT SELECTION</p>
          <p className="wic-panel-hint">Choose your primary health concern or symptoms. Select all that applies.</p>
          <div className="wic-complaint-grid">
            {COMPLAINTS.map((c) => (
              <label className="wic-complaint-item" key={c.key}>
                <input
                  type="checkbox"
                  checked={selectedComplaints.includes(c.key)}
                  onChange={() => onToggleComplaint(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="wic-panel">
          <p className="wic-panel-title">MANDATORY VITAL SIGNS INTAKE</p>
          <p className={`wic-panel-hint wic-instruction${isAbnormal ? " wic-panel-hint--danger" : ""}`}>
            Please position your right wrist in front of the temperature sensor and your left arm into the blood pressure cuff to acquire your vital signs.
          </p>
          <div className="wic-vitals-row">
            <span className="wic-vitals-label">Temperature:</span>
            <span className={`wic-vitals-value${isAbnormal ? " wic-vitals-value--danger" : ""}`}>
              {temperatureC != null
                ? `${temperatureC.toFixed(1)}°C - ${tempClass}`
                : <span className="wic-vitals-value--pending">Waiting for reading...</span>}
            </span>

            <span className="wic-vitals-label">Blood Pressure:</span>
            <span className="wic-vitals-value--pending">Manual entry required (not yet wired to kiosk)</span>
          </div>
        </div>

        <button
          className="btn-kiosk btn-kiosk-primary"
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue
        </button>

        <button className="wic-back-btn" onClick={onBack}>
          ⬅ Back to service selection
        </button>
        <a className="wic-faq-link" onClick={onFaq}>
          Frequently Asked Questions (FAQ's)
        </a>
      </main>
    </div>
  );
}
