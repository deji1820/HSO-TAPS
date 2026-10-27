import KioskHeader from "../components/KioskHeader.jsx";
import useCountdown from "../hooks/useCountdown.js";
import "../styles/screens/Appointment.css";

export default function AppointmentConfirmedScreen({
  consultSubType,
  serviceLabel,
  purposeLabel,
  requirements = [],
  dateLabel,     // e.g. "Friday, October 2, 2026"
  timeLabel,     // e.g. "9:30 AM"
  pendingEmailSent,
  notificationEmail,
  onDone,        // called by the End button and when the countdown hits 0
  onFaq,
  isOnline,
}) {
  const remaining = useCountdown(30, onDone);

  return (
    <div className="kiosk-shell apt-screen apt-screen--confirmed">
      <KioskHeader isOnline={isOnline} />
      <main className="kiosk-content apt-page apt-page--confirmed">
        <p className="apt-eyebrow">SERVICE: {serviceLabel || `${consultSubType?.toUpperCase()} CONSULTATION`}{serviceLabel ? " > BOOK AN APPOINTMENT" : ""}</p>
        <h1 className="apt-heading">Appointment request submitted</h1>

        <div className="apt-details-card">
          <p className="apt-details-title">APPOINTMENT DETAILS</p>
          <div className="apt-details-row">
            <span className="apt-details-label">{purposeLabel ? "Purpose:" : "Date:"}</span>
            <span className="apt-details-value">{purposeLabel || dateLabel}</span>
          </div>
          <div className="apt-details-row">
            <span className="apt-details-label">Time:</span>
            <span className="apt-details-value">{timeLabel}</span>
          </div>
        </div>

        {purposeLabel && requirements.length > 0 && <div className="apt-details-card apt-clearance-requirements"><p className="apt-details-title">CLEARANCE REQUIREMENTS</p><ul>{requirements.map((item) => <li key={item.text}><strong>{item.kind === "document" && item.required ? "Required document: " : item.kind === "action" ? "Next step: " : "When applicable: "}</strong>{item.text}</li>)}</ul></div>}

        <div className="apt-reminders">
          <p className="apt-reminders-title">PENDING HEALTH SERVICES OFFICE REVIEW</p>
          <p>{pendingEmailSent
            ? `A pending request confirmation was emailed to ${notificationEmail}. We’ll email you again when the appointment is accepted or rejected.`
            : `We could not send the pending confirmation email to ${notificationEmail || "your school address"}. The request is saved; please contact the Health Services Office if you need confirmation.`} Please wait for the decision before coming to the clinic.</p>
          <p className="apt-reminders-title">IF ACCEPTED:</p>
          <p>Take a picture of the appointment details before you leave the kiosk.</p>
          <p>Arrive on or before the appointment time. On the appointment day, tap your ID at the kiosk; if your accepted appointment is displayed, you may skip the walk-in queue and go inside the clinic at the scheduled time{purposeLabel ? " with the complete requirements." : "."}</p>
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
