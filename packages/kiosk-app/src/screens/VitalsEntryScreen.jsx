import { useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/VitalsEntry.css";

// Clean SVG icon components instead of emojis
function HeightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M8 5l4-3 4 3M8 19l4 3 4-3" />
    </svg>
  );
}

function WeightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3m0 0l-5 8h10l-5-8zm-6 8a6 6 0 0 0 12 0H6z" />
    </svg>
  );
}

function TempIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function BackspaceIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <line x1="18" y1="9" x2="12" y2="15" />
      <line x1="12" y1="9" x2="18" y2="15" />
    </svg>
  );
}

const FIELD_CONFIGS = {
  heightCm: {
    id: "heightCm",
    label: "Height",
    IconComponent: HeightIcon,
    unit: "cm",
    placeholder: "Leave empty for sensor",
    formatConversion: (val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) return null;
      const totalInches = num / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return `≈ ${feet} ft ${inches} in`;
    },
  },
  weightKg: {
    id: "weightKg",
    label: "Weight",
    IconComponent: WeightIcon,
    unit: "kg",
    placeholder: "Leave empty for sensor",
    formatConversion: (val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) return null;
      return `≈ ${(num * 2.20462).toFixed(1)} lbs`;
    },
  },
  temperatureC: {
    id: "temperatureC",
    label: "Body Temperature",
    IconComponent: TempIcon,
    unit: "°C",
    placeholder: "Leave empty for sensor",
    formatConversion: (val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) return null;
      return `≈ ${((num * 9) / 5 + 32).toFixed(1)} °F`;
    },
  },
};

const MODE_FIELDS = {
  complete: ["heightCm", "weightKg", "temperatureC"],
  physical: ["heightCm", "weightKg"],
  temperature: ["temperatureC"],
};

const GUIDED_STEPS = {
  complete: ["temperatureC", "bloodPressure", "heightCm", "weightKg", "review"],
  physical: ["heightCm", "weightKg", "review"], temperature: ["temperatureC", "review"], bmi: ["heightCm", "weightKg", "review"],
};
const STEP_LABELS = { temperatureC: "Temperature", bloodPressure: "Blood pressure", heightCm: "Height", weightKg: "Weight", review: "Review and confirmation" };

const KEYPAD_KEYS = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: ".", label: "." },
  { key: "0", label: "0" },
  { key: "back", label: <BackspaceIcon />, variant: "back" },
  { key: "clear", label: "CLEAR", variant: "clear" },
];

export default function VitalsEntryScreen({
  mode = "complete",
  initialReadings = {},
  onProceed,
  onAutoScan,
  onBack,
  isOnline,
}) {
  const activeFieldKeys = MODE_FIELDS[mode] || MODE_FIELDS.complete;
  const firstGuidedStep = (GUIDED_STEPS[mode] || GUIDED_STEPS.complete)[0];
  const [activeField, setActiveField] = useState(activeFieldKeys.includes(firstGuidedStep) ? firstGuidedStep : activeFieldKeys[0]);
  const guidedSteps = GUIDED_STEPS[mode] || GUIDED_STEPS.complete;
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = guidedSteps[stepIndex];
  const [submitting, setSubmitting] = useState(false);

  const [values, setValues] = useState(() => {
    const init = {};
    activeFieldKeys.forEach((key) => {
      init[key] = initialReadings[key] != null ? String(initialReadings[key]) : "";
    });
    return init;
  });

  const handleKeyPress = (key) => {
    setValues((prev) => {
      const currentVal = prev[activeField] || "";
      if (key === "back") {
        return { ...prev, [activeField]: currentVal.slice(0, -1) };
      }
      if (key === "clear") {
        return { ...prev, [activeField]: "" };
      }
      if (key === ".") {
        if (currentVal.includes(".")) return prev;
        return { ...prev, [activeField]: currentVal === "" ? "0." : currentVal + "." };
      }
      if (currentVal.length >= 6) return prev;
      return { ...prev, [activeField]: currentVal + key };
    });
  };

  const handleProceed = () => {
    if (submitting) return;
    setSubmitting(true);
    const parsedReadings = {};
    activeFieldKeys.forEach((key) => {
      const val = values[key]?.trim();
      if (val && !isNaN(Number(val)) && Number(val) > 0) {
        parsedReadings[key] = Number(val);
      }
    });
    onProceed(parsedReadings);
  };
  const advance = () => {
    if (currentStep === "review") return handleProceed();
    const nextIndex = Math.min(stepIndex + 1, guidedSteps.length - 1);
    setStepIndex(nextIndex);
    if (activeFieldKeys.includes(guidedSteps[nextIndex])) setActiveField(guidedSteps[nextIndex]);
  };
  const previous = () => {
    if (stepIndex === 0) return onBack?.();
    const previousIndex = stepIndex - 1;
    setStepIndex(previousIndex);
    if (activeFieldKeys.includes(guidedSteps[previousIndex])) setActiveField(guidedSteps[previousIndex]);
  };

  const currentFieldConfig = FIELD_CONFIGS[activeField];

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />

      <div className="kiosk-content">
        <div className="vitals-entry-container">
          <div className="vitals-entry-card">
            {/* Clean, institutional header aligned with NU Blue */}
            <div className="vitals-entry-header">
              <div><h2>Guided Vital Signs</h2><p>Step {stepIndex + 1} of {guidedSteps.length}: {STEP_LABELS[currentStep]}</p></div>
            </div>

            <div className="vitals-entry-body">
              {/* Left Column: Selectable Metric Fields */}
              <div className="vitals-fields-list">
                <p className="vitals-instruction-hint">Enter a value if available. If it was not measured, leave it blank; the connected equipment will be used where available.</p>
                {currentStep === "bloodPressure" ? <div className="vitals-field-item active"><strong>Blood pressure</strong><p>Use the clinic blood pressure monitor. It will collect a reading after you review this form.</p><span className="vitals-field-status status-auto">Not yet collected</span></div> : currentStep === "review" ? <div className="vitals-review-list" aria-live="polite">{guidedSteps.filter((key) => key !== "review").map((key) => <p key={key}><strong>{STEP_LABELS[key]}:</strong> {key === "bloodPressure" ? "Will be collected by the blood pressure monitor" : values[key]?.trim() ? `${values[key]} ${FIELD_CONFIGS[key].unit}` : "Not entered - sensor measurement will be attempted where available"}</p>)}</div> : activeFieldKeys.filter((key) => key === currentStep).map((key) => {
                  const cfg = FIELD_CONFIGS[key];
                  const rawVal = values[key];
                  const hasVal = rawVal?.trim() && !isNaN(Number(rawVal)) && Number(rawVal) > 0;
                  const isActive = activeField === key;
                  const conversion = hasVal ? cfg.formatConversion(rawVal) : null;
                  const Icon = cfg.IconComponent;

                  return (
                    <div
                      key={key}
                      className={`vitals-field-item ${isActive ? "active" : ""}`}
                      onClick={() => setActiveField(key)}
                    >
                      <div className="vitals-field-top">
                        <span className="vitals-field-title">
                          <span className="vitals-field-icon"><Icon /></span>
                          <span>{cfg.label}</span>
                        </span>
                        <span className={`vitals-field-status ${hasVal ? "status-manual" : "status-auto"}`}>
                          {hasVal ? "Manual" : "Auto Sensor"}
                        </span>
                      </div>

                      <div className="vitals-field-value-row">
                        {hasVal ? (
                          <span className="vitals-field-val">
                            {rawVal}
                            <span className="vitals-field-unit">{cfg.unit}</span>
                          </span>
                        ) : (
                          <span className="vitals-field-placeholder">{cfg.placeholder}</span>
                        )}

                        {conversion && (
                          <span className="vitals-field-conversion">{conversion}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Numeric Touch Keypad */}
              {currentStep !== "review" && currentStep !== "bloodPressure" && <div className="vitals-keypad-panel">
                <div className="vitals-keypad-hint">
                  Typing for: <strong>{currentFieldConfig?.label} ({currentFieldConfig?.unit})</strong>
                </div>

                <div className="vitals-keypad-grid">
                  {KEYPAD_KEYS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      className={`vkey ${k.variant ? `vkey-${k.variant}` : ""} ${k.key === "clear" ? "vkey-action" : ""}`}
                      onClick={() => handleKeyPress(k.key)}
                      style={k.key === "clear" ? { gridColumn: "span 3", padding: "12px 0" } : {}}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>}
            </div>

            {/* Bottom Navigation & Action Buttons */}
            <div className="vitals-entry-actions-footer">
              <button type="button" className="btn-vitals-back" onClick={previous}>Back</button>
              <div className="vitals-actions-right">
                <button type="button" className="btn-vitals-proceed" onClick={advance} disabled={submitting}>
                  {currentStep === "review" ? "Submit Intake" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
