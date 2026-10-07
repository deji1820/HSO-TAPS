import { useEffect, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import { classifyBP } from "../utils/bp.js";
import "../styles/screens/Screening.css";

const MODE_LABELS = {
  complete: "COMPLETE SCREENING",
  temperature: "TEMPERATURE SCREENING ONLY",
  bloodPressure: "BLOOD PRESSURE SCREENING ONLY",
  bmi: "BMI SCREENING ONLY",
};

function bmiValue(heightCm, weightKg) {
  if (heightCm == null || weightKg == null || Number(heightCm) <= 0) return null;
  const meters = Number(heightCm) > 3 ? Number(heightCm) / 100 : Number(heightCm);
  return (Number(weightKg) / (meters * meters)).toFixed(2);
}

function Reading({ label, children }) {
  return <div className="qhs-reading"><strong>{label}</strong><span>{children}</span></div>;
}

function BloodPressureRows({ readings, pulseBpm, bpNoReading, bpWaiting }) {
  const parts = String(readings.bloodPressure ?? "").split("/");
  const systolic = readings.systolicMmhg ?? (parts.length === 2 ? Number(parts[0]) : null);
  const diastolic = readings.diastolicMmhg ?? (parts.length === 2 ? Number(parts[1]) : null);
  const pulse = pulseBpm ?? readings.pulseBpm ?? null;
  const classification = readings.bloodPressureClassification ||
    (systolic != null && diastolic != null ? classifyBP(systolic, diastolic) : null);
  const hasPressure = readings.bloodPressure != null || (systolic != null && diastolic != null);

  if (bpNoReading) {
    return <Reading label="Blood Pressure:"><span className="qhs-bp-error">No BP reading available — please see clinic staff.</span></Reading>;
  }
  if (bpWaiting) {
    return <Reading label="Blood Pressure:"><span className="qhs-bp-waiting">Reading from device, please wait…</span></Reading>;
  }
  if (!hasPressure) {
    return <Reading label="Blood Pressure:">{"<<systolic/diastolic pressure in mmHg>>  <<classification>>"}</Reading>;
  }

  return (
    <>
      {systolic != null && <Reading label="Systolic:">{systolic} mmHg</Reading>}
      {diastolic != null && <Reading label="Diastolic:">{diastolic} mmHg</Reading>}
      {systolic == null && diastolic == null && <Reading label="Blood Pressure:">{readings.bloodPressure} mmHg</Reading>}
      {pulse != null && <Reading label="Pulse Rate:">{pulse} bpm</Reading>}
      {classification && <Reading label="BP Classification:">{classification}</Reading>}
    </>
  );
}

export default function ScreeningReadingsScreen({
  mode,
  readings = {},
  pulseBpm,
  bpNoReading = false,
  bpWaiting = false,
  isResult = false,
  sensorFailed = false,
  onManual,
  onDone,
  onBack,
  onRetry,
  isOnline,
}) {
  const [remaining, setRemaining] = useState(30);
  useEffect(() => {
    if (!isResult) return undefined;
    setRemaining(30);
    const timer = setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [isResult]);
  useEffect(() => {
    if (isResult && remaining === 0) onDone?.();
  }, [isResult, remaining, onDone]);

  const temp = readings.temperatureC != null
    ? `${Number(readings.temperatureC).toFixed(1)}°C  ${Number(readings.temperatureC) >= 37.8 ? "Fever" : Number(readings.temperatureC) < 35.5 ? "Hypothermia" : "Normal"}`
    : "<<temperature in degrees celcius>>  <<classification>>";
  const meters = readings.heightCm != null ? `${(Number(readings.heightCm) > 3 ? Number(readings.heightCm) / 100 : Number(readings.heightCm)).toFixed(2)} m` : "<<height in meters>>";
  const weight = readings.weightKg != null ? `${Number(readings.weightKg).toFixed(2)} kg` : "<<weight in kg>>";
  const bmi = bmiValue(readings.heightCm, readings.weightKg);
  const isComplete = mode === "complete";
  const steps = mode === "complete"
    ? [
        { key: "temperatureC", title: "Step 1 — Temperature", text: "Place your right wrist in front of the sensor on the right side of the kiosk. Hold steady until the reading completes." },
        { key: "heightCm", title: "Step 2 — Height", text: "Stand directly under the height sensor and stand straight and steady." },
        { key: "weightKg", title: "Step 3 — Weight", text: "Step onto the weighing scale platform and remain still until the reading stabilizes." },
        { key: "bloodPressure", title: "Step 4 — Blood Pressure / BPM", text: "Insert your left arm into the cuff on the left side of the kiosk. Hold steady until the measurement completes." },
      ]
    : mode === "bmi"
      ? [
          { key: "heightCm", title: "Step 1 — Height", text: "Stand directly under the height sensor and stand straight and steady." },
          { key: "weightKg", title: "Step 2 — Weight", text: "Step onto the weighing scale platform and remain still until the reading stabilizes." },
        ]
      : mode === "temperature"
        ? [{ key: "temperatureC", title: "Temperature", text: "Place your right wrist in front of the sensor on the right side of the kiosk. Hold steady until the reading completes." }]
        : [{ key: "bloodPressure", title: "Blood Pressure / BPM", text: "Insert your left arm into the cuff on the left side of the kiosk. Hold steady until the measurement completes." }];
  const currentStep = steps.find(({ key }) => {
    if (key === "bloodPressure") return !readings.bloodPressure && readings.systolicMmhg == null && !bpNoReading;
    return readings[key] == null;
  }) || steps[steps.length - 1];

  return (
    <div className="kiosk-shell qhs-reading-screen">
      <KioskHeader isOnline={isOnline} />
      <main className="qhs-reading-content">
        <div className="qhs-banner">Take a photo of your health screening summary for your personal record before leaving the kiosk.</div>
        <div className="qhs-reading-heading">
          <p>SERVICE: QUICK HEALTH SCREENING &gt; {MODE_LABELS[mode]}</p>
          <h1>Follow the prompts to measure your vitals</h1>
        </div>
        <section className="qhs-reading-panel">
          <h2>{isComplete ? "VITAL SIGNS AND PHYSICAL METRICS READINGS" : currentStep.title.toUpperCase()}</h2>
          {!isResult && <p className="qhs-instruction">{currentStep.text}</p>}

          {isComplete ? (
            <>
              <Reading label="Temperature:">{temp}</Reading>
              <BloodPressureRows readings={readings} pulseBpm={pulseBpm} bpNoReading={bpNoReading} bpWaiting={bpWaiting} />
              <Reading label="Height:">{meters}</Reading>
              <Reading label="Weight:">{weight}</Reading>
              <Reading label="BMI:">{bmi ? `${bmi}  ${Number(bmi) < 18.5 ? "Underweight" : Number(bmi) < 25 ? "Normal" : Number(bmi) < 30 ? "Overweight" : "Obese"}` : "<<numerical body mass index>>  <<classification>>"}</Reading>
              <div className="qhs-summary"><strong>Screening Summary</strong><span>&lt;&lt;System-generated note&gt;&gt;</span></div>
            </>
          ) : mode === "temperature" ? (
            <Reading label="Temperature:">{temp}</Reading>
          ) : mode === "bloodPressure" ? (
            <BloodPressureRows readings={readings} pulseBpm={pulseBpm} bpNoReading={bpNoReading} bpWaiting={bpWaiting} />
          ) : (
            <>
              <Reading label="Height:">{meters}</Reading>
              <Reading label="Weight:">{weight}</Reading>
              <Reading label="BMI:">{bmi ? `${bmi}  ${Number(bmi) < 18.5 ? "Underweight" : Number(bmi) < 25 ? "Normal" : Number(bmi) < 30 ? "Overweight" : "Obese"}` : "<<numerical body mass index>>  <<classification>>"}</Reading>
            </>
          )}
          {sensorFailed && !isResult && !bpWaiting && !bpNoReading && <p className="qhs-sensor-error">Sensor readings are unavailable. Please ask clinic staff for assistance.</p>}
        </section>
        {isResult ? (
          <>
            <button className="qhs-done" onClick={onDone}>Done <span aria-hidden="true">✓</span></button>
            <p className="qhs-autoclose">Auto-closes in {remaining}s...</p>
          </>
        ) : (
          <div className="qhs-capture-actions">
            <button className="qhs-done" onClick={onRetry}>Restart readings</button>
            {mode !== "bloodPressure" && onManual && <button className="qhs-done" onClick={onManual}>Enter readings manually</button>}
            <button className="qhs-done qhs-back" onClick={onBack}>Back to screening options</button>
          </div>
          )}
        <a className="qhs-faq" href="#faq" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("kiosk:faq")); }}>Frequently Asked Questions (FAQ’s)</a>
      </main>
    </div>
  );
}
