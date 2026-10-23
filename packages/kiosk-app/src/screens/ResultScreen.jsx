import KioskHeader from "../components/KioskHeader.jsx";
import { classifyTemperature } from "../utils/temperature.js";
import "../styles/screens/Result.css";

function formatHeight(heightInput) {
  if (heightInput == null || heightInput === "") return null;
  const num = Number(heightInput);
  if (isNaN(num) || num <= 0) return null;
  // If provided in cm (> 3), convert to meters
  const meters = num > 3 ? num / 100 : num;
  const metersFormatted = meters.toFixed(2);

  const totalInches = meters * 39.3700787;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches % 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }

  return {
    meters: metersFormatted,
    metersNum: meters,
    feetInches: `${feet} ft ${inches} in`
  };
}

function computeBmi(heightInput, weightInput) {
  if (heightInput == null || weightInput == null) return null;
  const hNum = Number(heightInput);
  const wNum = Number(weightInput);
  if (isNaN(hNum) || isNaN(wNum) || hNum <= 0 || wNum <= 0) return null;

  const m = hNum > 3 ? hNum / 100 : hNum;
  const val = Number((wNum / (m * m)).toFixed(2));
  let category = "Normal";
  let categoryClass = "badge-normal";
  let message = "Your BMI is within the standard healthy weight range (18.50 – 24.90).";

  if (val < 18.5) {
    category = "Underweight";
    categoryClass = "badge-warning";
    message = "Your BMI is below standard (< 18.50). Consider consulting the clinic nurse for nutritional advice.";
  } else if (val >= 25.0 && val < 30.0) {
    category = "Overweight";
    categoryClass = "badge-warning";
    message = "Your BMI is in the overweight range (25.00 – 29.90). Balanced diet and exercise are recommended.";
  } else if (val >= 30.0) {
    category = "Obese";
    categoryClass = "badge-danger";
    message = "Your BMI is in the obese category (≥ 30.00). Clinic staff are available for health lifestyle consultations.";
  }

  const minHealthyWeight = (18.5 * m * m).toFixed(2);
  const maxHealthyWeight = (24.9 * m * m).toFixed(2);

  return {
    value: val.toFixed(2),
    category,
    categoryClass,
    message,
    healthyRange: `${minHealthyWeight} – ${maxHealthyWeight} kg`
  };
}

export default function ResultScreen({ readings, overrideTriggered, queueNumber, onAdjust, onDone, isOnline }) {
  const heightInfo = formatHeight(readings?.heightCm ?? readings?.height);
  const rawWeight = readings?.weightKg ?? readings?.weight;
  const weightFormatted = rawWeight != null && !isNaN(Number(rawWeight)) 
    ? Number(rawWeight).toFixed(2) 
    : null;

  const rawTemp = readings?.temperatureC ?? readings?.temperature;
  const tempFormatted = rawTemp != null && !isNaN(Number(rawTemp))
    ? Number(rawTemp).toFixed(2)
    : null;

  const bmi = computeBmi(readings?.heightCm ?? readings?.height, rawWeight);
  const tempClassification = classifyTemperature(rawTemp);
  const isFever = tempClassification === "Fever";
  const isHypothermia = tempClassification === "Hypothermia";
  const hasTemperatureAlert = isFever || isHypothermia;
  const hasFeverAlert = hasTemperatureAlert || overrideTriggered;

  const tempStatus = tempFormatted != null 
    ? (isFever ? "Elevated / Fever" : isHypothermia ? "Hypothermia" : "Normal (35.50°C – 37.79°C)")
    : null;

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />

      <div className="kiosk-content">
        {hasFeverAlert ? (
          <>
            <div className="result-icon result-icon-alert">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h1 className="result-title-alert">Please proceed inside the clinic immediately</h1>
            <p className="kiosk-subtitle fever-subtitle">
              {isHypothermia ? "Low" : "High"} body temperature detected ({tempFormatted ?? readings?.temperatureC}°C). Please proceed inside the clinic for direct attention of the nurse.
            </p>
          </>
        ) : (
          <>
            <div className="result-icon result-icon-ok">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1>All done — here are your results</h1>
            <p className="kiosk-subtitle">Summary of your acquired vital signs and measurements</p>
          </>
        )}

        {queueNumber && <div className={`result-queue-status${hasTemperatureAlert ? " result-queue-status--priority" : ""}`} role="status">
          <strong>{hasTemperatureAlert ? "Priority queue number" : "Your queue number"}: {queueNumber}</strong>
          <p>{hasTemperatureAlert
            ? "A priority queue entry was created. Proceed inside the clinic now and show this number to staff."
            : "You have joined the clinic queue. Wait for your number to appear under Now Serving on the Clinic Queue board."}</p>
        </div>}

        {/* Minimalist Stat Cards Grid */}
        <div className="reading-summary-grid">
          {tempFormatted != null && (
            <div className={`reading-summary-stat ${hasTemperatureAlert ? "stat-fever" : ""}`}>
              <span className="reading-summary-label">Body Temp</span>
              <span className="reading-summary-value">{tempFormatted}°C</span>
              <span className={`reading-badge ${hasTemperatureAlert ? "badge-fever" : "badge-normal"}`}>
                {isFever ? "Fever Detected" : isHypothermia ? "Low Temperature" : "Normal"}
              </span>
            </div>
          )}

          {heightInfo != null && (
            <div className="reading-summary-stat">
              <span className="reading-summary-label">Height</span>
              <span className="reading-summary-value">{heightInfo.meters} m</span>
              <span className="reading-summary-sub">{heightInfo.feetInches}</span>
            </div>
          )}

          {weightFormatted != null && (
            <div className="reading-summary-stat">
              <span className="reading-summary-label">Weight</span>
              <span className="reading-summary-value">{weightFormatted} kg</span>
              <span className="reading-summary-sub">{(Number(rawWeight) * 2.20462).toFixed(2)} lbs</span>
            </div>
          )}

          {bmi != null && (
            <div className="reading-summary-stat">
              <span className="reading-summary-label">BMI Reading</span>
              <span className="reading-summary-value">{bmi.value}</span>
              <span className={`reading-badge ${bmi.categoryClass}`}>{bmi.category}</span>
            </div>
          )}
        </div>

        {/* Clean Vitals & BMI Analysis Card */}
        {(bmi != null || tempFormatted != null) && (
          <div className="vitals-analysis-card">
            <div className="vitals-analysis-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <span>Vitals & BMI Analysis</span>
            </div>

            <div className="vitals-analysis-content">
              <div className="vitals-analysis-row">
                {bmi && heightInfo && (
                  <div className="vitals-analysis-col">
                    <span className="vitals-col-label">Healthy Weight for Height ({heightInfo.meters} m):</span>
                    <span className="vitals-col-val">{bmi.healthyRange}</span>
                  </div>
                )}
                {tempStatus && (
                  <div className="vitals-analysis-col">
                    <span className="vitals-col-label">Thermal Status:</span>
                    <span className={`vitals-col-val ${hasTemperatureAlert ? "text-fever" : "text-normal"}`}>
                      {tempStatus}
                    </span>
                  </div>
                )}
              </div>

              {bmi && (
                <p className="vitals-analysis-note">{bmi.message}</p>
              )}
            </div>
          </div>
        )}

        <div className="result-actions-row">
          {onAdjust && (
            <button className="btn-kiosk btn-kiosk-muted result-adjust-btn" onClick={onAdjust}>
              Correct Readings
            </button>
          )}
          <button className="btn-kiosk btn-kiosk-primary result-done-btn" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
