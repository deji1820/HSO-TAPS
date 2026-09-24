import KioskHeader from "../components/KioskHeader.jsx";
import useCountdown from "../hooks/useCountdown.js";
import "../styles/screens/Appointment.css";

export default function AppointmentConfirmedScreen({
  consultSubType,
  dateLabel,     // e.g. "Friday, October 2, 2026"
  timeLabel,     // e.g. "9:30 AM"
  onDone,        // called by the End button and when the countdown hits 0
  onFaq,
  isOnline,
}) {
  const remaining = useCountdown(30, onDone);

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />
      <div className="kiosk-content apt-page">
        <p className="apt-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
        <h1 className="apt-heading">BOOK AN APPOINTMENT</h1>
        <p className="apt-subtext">Your appointment has been booked.</p>

        <div className="apt-details-card">
          <p className="apt-details-title">APPOINTMENT DETAILS</p>
          <div className="apt-details-row">
            <span className="apt-details-label">Date:</span>
            <span className="apt-details-value">{dateLabel}</span>
          </div>
          <div className="apt-details-row">
            <span className="apt-details-label">Time:</span>
            <span className="apt-details-value">{timeLabel}</span>
          </div>
        </div>

        <div className="apt-reminders">
          <p className="apt-reminders-title">IMPORTANT REMINDERS:</p>
          <p>Take a picture of the appointment details before you leave the kiosk.</p>
          <p>Please arrive on or before your appointment schedule.</p>
          <p>Don't forget to check-in with the kiosk before entering the clinic on your appointment schedule.</p>
        </div>

        <button className="apt-btn apt-btn--end" onClick={onDone}>
          End — returning to welcome screen in {remaining}s
        </button>
        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ's)</button>
      </div>
    </div>
  );
}