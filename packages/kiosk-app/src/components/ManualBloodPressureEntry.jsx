import { useState } from "react";
import "../styles/components/ManualBloodPressureEntry.css";

export default function ManualBloodPressureEntry({ onSubmit }) {
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const systolicValue = Number(systolic);
    const diastolicValue = Number(diastolic);
    const pulseValue = pulse === "" ? null : Number(pulse);

    if (!systolic || !diastolic || systolicValue < 50 || systolicValue > 260 ||
        diastolicValue < 30 || diastolicValue > 160 || systolicValue <= diastolicValue) {
      setError("Enter a valid systolic and diastolic reading from the cuff display.");
      return;
    }
    if (pulseValue != null && (pulseValue < 30 || pulseValue > 220)) {
      setError("Enter a pulse from 30 to 220 bpm, or leave it blank.");
      return;
    }

    setError("");
    onSubmit?.({ systolicMmhg: systolicValue, diastolicMmhg: diastolicValue, pulseBpm: pulseValue });
  }

  return (
    <form className="wic-manual-bp" onSubmit={handleSubmit}>
      <h3>Enter the cuff reading manually</h3>
      <p>Copy the values from the blood pressure monitor. Ask clinic staff if you need help.</p>
      <div className="wic-manual-bp-fields">
        <label>Systolic (mmHg)
          <input aria-label="Systolic blood pressure in millimeters of mercury" type="number" inputMode="numeric" min="50" max="260" step="1" required value={systolic} onChange={(event) => setSystolic(event.target.value)} />
        </label>
        <label>Diastolic (mmHg)
          <input aria-label="Diastolic blood pressure in millimeters of mercury" type="number" inputMode="numeric" min="30" max="160" step="1" required value={diastolic} onChange={(event) => setDiastolic(event.target.value)} />
        </label>
        <label>Pulse (bpm, optional)
          <input aria-label="Pulse rate in beats per minute, optional" type="number" inputMode="numeric" min="30" max="220" step="1" value={pulse} onChange={(event) => setPulse(event.target.value)} />
        </label>
      </div>
      {error && <p className="wic-manual-bp-error" role="alert">{error}</p>}
      <button className="wic-manual-bp-submit" type="submit">Use this BP for my queue</button>
    </form>
  );
}
