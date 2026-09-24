import { useEffect, useRef, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/WalkInConsultation.css";

export default function WalkInResultScreen({
  consultSubType,
  overrideTriggered,   // bool — matches App.jsx state name
  queueCode,           // e.g. "M0014"
  temperatureC,
  temperatureClassification,
  onTimeout,           // called when countdown hits 0
  onFaq,
  isOnline,
}) {
  const seconds = overrideTriggered ? 15 : 30;
  const [remaining, setRemaining] = useState(seconds);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    setRemaining(seconds);
    const id = setInterval(() => setRemaining((r) => Math.max(r - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  useEffect(() => {
    if (remaining === 0) onTimeoutRef.current?.();
  }, [remaining]);

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />
      <div className="kiosk-content">
        <p className="wic-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
        <h1 className="wic-heading">WALK-IN CONSULTATION</h1>

        {overrideTriggered ? (
          <>
            <div className="wic-result-box">
              <p className="wic-result-box-title">VITAL SIGNS SUMMARY</p>
              <div className="wic-vitals-summary">
                <div className="wic-vitals-row">
                  <span className="wic-vitals-label">Temperature:</span>
                  <span className="wic-vitals-value--danger">
                    {temperatureC?.toFixed(1)}°C — {temperatureClassification}
                  </span>
                  <span className="wic-vitals-label">Blood Pressure:</span>
                  <span className="wic-vitals-value--pending">Manual entry required</span>
                </div>
              </div>
            </div>
            <p className="wic-warning">⚠️ PLEASE PROCEED DIRECTLY INSIDE THE CLINIC IMMEDIATELY.</p>
            <p className="wic-warning-detail">
  {temperatureClassification === "Hypothermia"
    ? "A low temperature reading was detected. Please see the duty nurse for immediate assessment."
    : "An elevated temperature reading was detected. Please see the duty nurse for immediate assessment."}
</p>
          </>
        ) : (
          <>
            <div className="wic-result-box">
              <p className="wic-result-box-title">YOUR QUEUE NUMBER:</p>
              <p className="wic-queue-code">{queueCode}</p>
            </div>
            <div className="wic-result-box">
              <p className="wic-result-box-title">VITAL SIGNS AND PHYSICAL METRICS SUMMARY</p>
              <div className="wic-vitals-summary">
                <div className="wic-vitals-row">
                  <span className="wic-vitals-label">Temperature:</span>
                  <span className="wic-vitals-value">
                    {temperatureC?.toFixed(1)}°C — {temperatureClassification}
                  </span>
                  <span className="wic-vitals-label">Blood Pressure:</span>
                  <span className="wic-vitals-value--pending">Manual entry required</span>
                </div>
              </div>
            </div>
            <p className="wic-reminder">
              IMPORTANT REMINDERS:
              <span className="wic-reminder-body"><br />Take a picture of the queue number before you leave the kiosk, and wait on the clinic queue.</span>
            </p>
          </>
        )}

        <button className="wic-back-btn" disabled>
          Returning to welcome screen in {remaining}s...
        </button>
        <a className="wic-faq-link" onClick={onFaq}>
          Frequently Asked Questions (FAQ's)
        </a>
      </div>
    </div>
  );
}