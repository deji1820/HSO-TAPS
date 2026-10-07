import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/Capturing.css";

function WristTempIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      <path d="M17 10h4M17 14h3M17 6h2" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      <path d="M12 12v3" />
    </svg>
  );
}

function HeightPlatformIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v16M8 5l4-3 4 3" />
      <path d="M4 22h16" />
      <path d="M7 18h10" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const MODE_COPY = {
  complete: { title: "Automated Vitals Measurement", instruction: "Follow the positioning guides below while the sensors acquire your vitals." },
  temperature: { title: "Measuring Body Temperature", instruction: "Hold still while the thermal sensor scans your temperature." },
  physical: { title: "Measuring Height & Weight", instruction: "Please stand still and balanced on the measuring platform." },
};

export default function CapturingScreen({
  mode = "complete",
  readings = {},
  manualFields = [],
  sensorFailed = false,
  onCancel,
  onRetry,
  onManualEdit,
  onHome,
  isOnline,
}) {
  const copy = MODE_COPY[mode] || MODE_COPY.complete;
  const needsTemp = mode === "complete" || mode === "temperature";
  const needsPhysical = mode === "complete" || mode === "physical";

  const isTempManual = manualFields.includes("temperatureC");
  const isHeightManual = manualFields.includes("heightCm");
  const isWeightManual = manualFields.includes("weightKg");

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />

      <div className="kiosk-content capturing-container">
        {/* Subtle, Modern Sensor Pulse */}
        <div className="capturing-pulse">
          <div className="capturing-pulse-ring" />
          <div className="capturing-pulse-core" />
          <div className="capturing-pulse-scan-beam" />
        </div>

        <h1 className="capturing-title">{copy.title}</h1>
        <p className="capturing-subtitle">{copy.instruction}</p>

        {/* Dedicated Sensor Instruction Cards in 1 Row */}
        <div className="capturing-guide-grid">
          {needsTemp && (
            <div className={`guide-card ${readings.temperatureC != null ? "guide-done" : "guide-scanning"}`}>
              <div className="guide-card-icon">
                <WristTempIcon />
              </div>
              <div className="guide-card-info">
                <span className="guide-card-tag">Temperature Sensor</span>
                <p className="guide-card-text">
                  Please place your wrist on the temperature sensor.
                </p>
                <div className="guide-status-row">
                  <span className="guide-status-dot" />
                  <span className="guide-status-label">
                    {readings.temperatureC != null 
                      ? `Captured: ${readings.temperatureC}°C (${isTempManual ? "Manual" : "Sensor"})` 
                      : "Scanning wrist temperature..."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {needsPhysical && (
            <>
              <div className={`guide-card ${readings.weightKg != null ? "guide-done" : "guide-scanning"}`}>
                <div className="guide-card-icon">
                  <ScaleIcon />
                </div>
                <div className="guide-card-info">
                  <span className="guide-card-tag">Weight Sensor</span>
                  <p className="guide-card-text">
                    Step on the weighing scale properly.
                  </p>
                  <div className="guide-status-row">
                    <span className="guide-status-dot" />
                    <span className="guide-status-label">
                      {readings.weightKg != null 
                        ? `Captured: ${readings.weightKg} kg (${isWeightManual ? "Manual" : "Sensor"})` 
                        : "Measuring body weight..."}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`guide-card ${readings.heightCm != null ? "guide-done" : "guide-scanning"}`}>
                <div className="guide-card-icon">
                  <HeightPlatformIcon />
                </div>
                <div className="guide-card-info">
                  <span className="guide-card-tag">Height Sensor</span>
                  <p className="guide-card-text">
                    Stand properly on the platform to capture accurate height.
                  </p>
                  <div className="guide-status-row">
                    <span className="guide-status-dot" />
                    <span className="guide-status-label">
                      {readings.heightCm != null 
                        ? `Captured: ${readings.heightCm} cm (${isHeightManual ? "Manual" : "Sensor"})` 
                        : "Calibrating height alignment..."}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="capturing-actions-row">
          {onManualEdit && (
            <button className="btn-kiosk btn-kiosk-muted capturing-manual-btn" onClick={onManualEdit}>
              Adjust Manually
            </button>
          )}
          <button className="btn-kiosk btn-kiosk-danger-outline capturing-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {/* Failed Sensor Acquisition Modal Window */}
        {sensorFailed && (
          <div className="sensor-modal-overlay">
            <div className="sensor-modal-card">
              <div className="sensor-modal-icon-wrapper">
                <AlertTriangleIcon />
              </div>
              <h2 className="sensor-modal-title">Hardware Sensors Not Responding</h2>
              <p className="sensor-modal-description">
                No sensor readings were detected from the kiosk hardware. Please enter your vital signs manually or return to the main screen.
              </p>

              <div className="sensor-modal-actions">
                <button type="button" className="btn-kiosk btn-kiosk-primary" onClick={onRetry}>Retry</button>
                <button type="button" className="btn-kiosk btn-kiosk-primary sensor-modal-btn-manual" onClick={onManualEdit}>
                  Manually Input
                </button>
                <button type="button" className="btn-kiosk btn-kiosk-muted sensor-modal-btn-home" onClick={onHome || onCancel}>
                  Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
