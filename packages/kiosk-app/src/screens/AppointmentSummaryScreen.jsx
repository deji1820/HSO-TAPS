import KioskHeader from "../components/KioskHeader.jsx";
import VitalsRows from "../components/VitalsRows.jsx";
import useCountdown from "../hooks/useCountdown.js";
import "../styles/screens/Appointment.css";

export default function AppointmentSummaryScreen({
  consultSubType,
  temperatureC,
  temperatureClass,
  bloodPressure,
  bpClass,
  onDone,       // called by the End button and when the countdown hits 0
  onFaq,
  isOnline,
}) {
  const remaining = useCountdown(15, onDone);

  return (
    <div className="kiosk-shell apt-screen apt-screen--summary">
      <KioskHeader isOnline={isOnline} />
      <main className="kiosk-content apt-page apt-page--summary">
        <div className="apt-banner apt-banner--success">Please proceed inside the clinic for your appointment schedule.</div>
        <div className="apt-heading-block">
          <p className="apt-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
          <h1 className="apt-heading">Check-In Complete</h1>
        </div>

        <div className="apt-details-card">
          <p className="apt-details-title">INITIAL VITAL SIGNS SUMMARY</p>
          <VitalsRows
            temperatureC={temperatureC}
            temperatureClass={temperatureClass}
            bloodPressure={bloodPressure}
            bpClass={bpClass}
          />
        </div>

        <button className="apt-btn apt-btn--end" onClick={onDone}>
          End — returning to welcome screen in {remaining}s
        </button>
        <p className="apt-autoclose">Auto-closes in {remaining}s...</p>
        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ's)</button>
      </main>
    </div>
  );
}
