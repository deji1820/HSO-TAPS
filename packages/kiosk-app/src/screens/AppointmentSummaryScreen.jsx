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
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />
      <div className="kiosk-content apt-page">
        <p className="apt-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
        <h1 className="apt-heading apt-heading--success">APPOINTMENT FOUND TODAY</h1>
        <p className="apt-subtext">Your vital signs have been recorded.</p>

        <div className="apt-details-card">
          <p className="apt-details-title">VITAL SIGNS SUMMARY</p>
          <VitalsRows
            temperatureC={temperatureC}
            temperatureClass={temperatureClass}
            bloodPressure={bloodPressure}
            bpClass={bpClass}
          />
        </div>

        <div className="apt-proceed">
          <p className="apt-proceed-title">PLEASE PROCEED DIRECTLY INSIDE THE CLINIC.</p>
          <p className="apt-proceed-body">Proceed inside the clinic for your appointment schedule.</p>
        </div>

        <button className="apt-btn apt-btn--end" onClick={onDone}>
          End — returning to welcome screen in {remaining}s
        </button>
        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ's)</button>
      </div>
    </div>
  );
}