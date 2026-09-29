// Classification labels follow HSO-TAP_SYSTEM_NOTES (AHA/JNC 2017 for BP).
const DANGER = new Set(["Fever", "Hypothermia", "Low (Hypotension)", "Stage 2 Hypertension", "Hypertensive Crisis"]);
const CAUTION = new Set(["Stage 1 Hypertension", "Elevated"]);

function tone(label) {
  if (DANGER.has(label)) return " apt-vital--danger";
  if (CAUTION.has(label)) return " apt-vital--caution";
  return "";
}

export default function VitalsRows({ temperatureC, temperatureClass, bloodPressure, bpClass }) {
  return (
    <div className="apt-vitals">
      <span className="apt-vitals-label">Temperature:</span>
      <span className={`apt-vitals-value${tone(temperatureClass)}`}>
        {temperatureC != null ? (
          `${Number(temperatureC).toFixed(1)}°C${temperatureClass ? ` — ${temperatureClass}` : ""}`
        ) : (
          <span className="apt-pending">Waiting for reading...</span>
        )}
      </span>

      <span className="apt-vitals-label">Blood Pressure:</span>
      <span className={`apt-vitals-value${tone(bpClass)}`}>
        {bloodPressure ? (
          `${bloodPressure} mmHg${bpClass ? ` — ${bpClass}` : ""}`
        ) : (
          <span className="apt-pending">Waiting for reading...</span>
        )}
      </span>
    </div>
  );
}
