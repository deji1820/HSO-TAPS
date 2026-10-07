import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/MobileVitalsEntry.css";

const FIELDS = [
  ["temperatureC", "Body temperature", "°C"],
  ["systolicMmhg", "Systolic pressure", "mmHg"],
  ["diastolicMmhg", "Diastolic pressure", "mmHg"],
  ["pulseBpm", "Pulse rate", "bpm"],
  ["heightCm", "Height", "cm"],
  ["weightKg", "Weight", "kg"],
];

const MODES = {
  complete: ["temperatureC", "systolicMmhg", "diastolicMmhg", "pulseBpm", "heightCm", "weightKg"],
  temperature: ["temperatureC"],
  bloodPressure: ["systolicMmhg", "diastolicMmhg", "pulseBpm"],
  physical: ["heightCm", "weightKg"],
  bmi: ["heightCm", "weightKg"],
};

export default function MobileSensorReadingsScreen({ mode, readings = {}, waiting = false, error = "", onBack, onRetry, onManual, onContinue, isOnline }) {
  const fields = FIELDS.filter(([key]) => (MODES[mode] || MODES.complete).includes(key));
  return <div className="kiosk-shell mobile-vitals-screen">
    <KioskHeader isOnline={isOnline} />
    <main className="mobile-vitals-content">
      <p className="mobile-vitals-eyebrow">QUICK HEALTH SCREENING</p>
      <h1>{waiting ? "Reading from the kiosk" : "Your screening readings"}</h1>
      <p className="mobile-vitals-help">{waiting ? "The kiosk sensors are taking your measurements. Follow the instructions shown at the kiosk; readings will appear here as they arrive." : "Review the readings captured by the kiosk before submitting your screening."}</p>
      <section className="mobile-sensor-readings" aria-live="polite">
        {fields.map(([key, label, unit]) => <div className="mobile-sensor-reading" key={key}>
          <strong>{label}</strong>
          <span>{readings[key] == null ? (waiting ? "Waiting for reading…" : "Not available") : `${Number(readings[key]).toFixed(key === "systolicMmhg" || key === "diastolicMmhg" || key === "pulseBpm" ? 0 : 1)} ${unit}`}</span>
        </div>)}
        {readings.bloodPressureClassification && <div className="mobile-sensor-reading"><strong>Blood pressure classification</strong><span>{readings.bloodPressureClassification}</span></div>}
      </section>
      {error && <p className="mobile-vitals-error" role="alert">{error}</p>}
      <div className="mobile-vitals-actions">
        <button type="button" onClick={onBack}>Back</button>
        {waiting ? <><button type="button" onClick={onManual}>Enter manually</button><button type="button" onClick={onRetry}>Restart readings</button></> : <button type="button" onClick={onContinue}>Use these readings</button>}
      </div>
    </main>
  </div>;
}
