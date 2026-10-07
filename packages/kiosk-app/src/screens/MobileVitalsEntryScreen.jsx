import { useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/MobileVitalsEntry.css";

const SCREENING_FIELDS = {
  complete: ["temperatureC", "heightCm", "weightKg", "systolicMmhg", "diastolicMmhg"],
  temperature: ["temperatureC"],
  bloodPressure: ["systolicMmhg", "diastolicMmhg"],
  physical: ["heightCm", "weightKg"],
  bmi: ["heightCm", "weightKg"],
};

const LABELS = {
  temperatureC: ["Body temperature", "°C"],
  heightCm: ["Height", "cm"],
  weightKg: ["Weight", "kg"],
  systolicMmhg: ["Systolic pressure", "mmHg"],
  diastolicMmhg: ["Diastolic pressure", "mmHg"],
};

export default function MobileVitalsEntryScreen({ mode, onSubmit, onBack, isOnline }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fields = SCREENING_FIELDS[mode] || SCREENING_FIELDS.complete;

  async function submit(event) {
    event.preventDefault();
    if (fields.some((field) => !values[field] || Number(values[field]) <= 0)) {
      setError("Enter a valid value for each reading before continuing.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(values);
    } catch {
      setError("We couldn't save these readings. Please try again or go back.");
      setSaving(false);
    }
  }

  return <div className="kiosk-shell mobile-vitals-screen">
    <KioskHeader isOnline={isOnline} />
    <main className="mobile-vitals-content">
      <p className="mobile-vitals-eyebrow">QUICK HEALTH SCREENING</p>
      <h1>Enter your screening readings</h1>
      <p className="mobile-vitals-help">Enter readings provided by clinic staff or a measurement device. The phone cannot operate the kiosk sensors.</p>
      <form onSubmit={submit}>
        {fields.map((field) => <label className="mobile-vitals-field" key={field}>
          <span>{LABELS[field][0]} <small>({LABELS[field][1]})</small></span>
          <input type="number" inputMode="decimal" min="0.1" step="0.1" value={values[field] || ""} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} required />
        </label>)}
        {error && <p className="mobile-vitals-error" role="alert">{error}</p>}
        <div className="mobile-vitals-actions">
          <button type="button" onClick={onBack} disabled={saving}>Back</button>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : "Continue"}</button>
        </div>
      </form>
    </main>
  </div>;
}
