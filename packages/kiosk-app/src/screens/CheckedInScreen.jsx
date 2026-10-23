import KioskHeader from "../components/KioskHeader.jsx";
import { classifyTemperature } from "../utils/temperature.js";
import "../styles/screens/CheckedIn.css";

export default function CheckedInScreen({ info, onDone, isOnline }) {
  const temperatureStatus = classifyTemperature(info?.temperatureC);
  const isFever = temperatureStatus === "Fever";
  const isHypothermia = temperatureStatus === "Hypothermia";
  const isTemperatureAlert = isFever || isHypothermia;

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />

      <div className="kiosk-content">
        {isTemperatureAlert ? (
          <>
            <div className="checkin-success-icon alert-icon" style={{ background: '#fef2f2', color: 'var(--danger)', border: '2px solid #fecaca' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h1 style={{ color: "var(--danger)", maxWidth: "640px" }}>Please proceed inside the clinic immediately</h1>
            <p className="kiosk-subtitle" style={{ color: "#991b1b", fontWeight: 600, maxWidth: "600px" }}>
              {isHypothermia ? "Low" : "High"} body temperature detected ({Number(info.temperatureC).toFixed(1)} °C). Please proceed inside the clinic immediately for direct attention of the nurse.
            </p>
          </>
        ) : (
          <>
            <div className="checkin-success-icon" style={{ background: '#ecfdf5', color: 'var(--success)', border: '2px solid #a7f3d0' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1>You're checked in</h1>
            <p className="kiosk-subtitle">Please have a seat — a staff member will call you shortly.</p>
          </>
        )}

        <div className="kiosk-card checkin-summary">
          {info?.serviceType && (
            <div className="checkin-row">
              <span className="confirm-detail-label">Service:</span>
              <span className="confirm-detail-value">
                {info.serviceType}
                {info?.subType ? ` — ${info.subType}` : ""}
              </span>
            </div>
          )}
          {info?.temperatureC != null && (
            <div className="checkin-row">
              <span className="confirm-detail-label">Recorded Temp:</span>
              <span className="confirm-detail-value" style={{ fontWeight: 700, color: isTemperatureAlert ? '#dc2626' : '#16a34a' }}>
                {Number(info.temperatureC).toFixed(1)} °C
                {isFever ? " (Fever Flagged - Priority)" : isHypothermia ? " (Low Temperature - Priority)" : " (Normal)"}
              </span>
            </div>
          )}
          {info?.queueNumber && (
            <div className="checkin-queue-block">
              <span className="checkin-queue-label">{isTemperatureAlert ? "Priority Queue Number" : "Queue Number"}</span>
              <span className="checkin-queue-number">{info.queueNumber}</span>
              <p className="checkin-queue-instruction">{isTemperatureAlert
                ? "Proceed inside now and show this number to clinic staff."
                : "You have joined the clinic queue. Wait for your number to appear under Now Serving on the Clinic Queue board."}</p>
            </div>
          )}
        </div>

        <button className="btn-kiosk btn-kiosk-primary checkin-done-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
