import KioskHeader from "../components/KioskHeader.jsx";
import VitalsRows from "../components/VitalsRows.jsx";
import "../styles/screens/Appointment.css";

export default function AppointmentFoundScreen({
  consultSubType,
  doctorName,
  scheduledTime,
  temperatureC,
  temperatureClass,   // "Hypothermia" | "Normal" | "Fever"
  bloodPressure,      // e.g. "118/76"
  bpClass,            // e.g. "Normal", "Stage 1 Hypertension"
  onBack,
  onFaq,
  isOnline,
}) {
  return (
    <div className="kiosk-shell apt-screen apt-screen--found">
      <KioskHeader isOnline={isOnline} />
      <main className="kiosk-content apt-page apt-page--found">
        <div className="apt-banner apt-banner--success">Pre-scheduled appointment found today.</div>
        <div className="apt-heading-block">
          <p className="apt-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
          <h1 className="apt-heading">Please take your vitals to check in</h1>
        </div>

        <div className="apt-details-card">
          <p className="apt-details-title">APPOINTMENT DETAILS</p>
          <div className="apt-details-row">
            <span className="apt-details-label">Doctor:</span>
            <span className="apt-details-value">{doctorName}</span>
          </div>
          <div className="apt-details-row">
            <span className="apt-details-label">Scheduled Time:</span>
            <span className="apt-details-value">{scheduledTime}</span>
          </div>
        </div>

        <div className="apt-details-card">
          <p className="apt-details-title">MANDATORY VITAL SIGNS INTAKE</p>
          <p className="apt-hint">
            Please position your right wrist in front of the temperature sensor and your left arm
            into the blood pressure cuff to acquire your vital signs.
          </p>
          <VitalsRows
            temperatureC={temperatureC}
            temperatureClass={temperatureClass}
            bloodPressure={bloodPressure}
            bpClass={bpClass}
          />
        </div>

        <button className="apt-btn apt-btn--single" onClick={onBack}>⬅ Back to service selection</button>
        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ's)</button>
      </main>
    </div>
  );
}
