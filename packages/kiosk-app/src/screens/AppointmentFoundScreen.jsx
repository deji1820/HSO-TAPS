import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/Appointment.css";

export default function AppointmentFoundScreen({ appointment, onDone, onFaq, isOnline }) {
  const dateLabel = appointment?.dateKey
    ? new Date(`${appointment.dateKey}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "Today";
  return (
    <div className="kiosk-shell apt-screen apt-screen--found">
      <KioskHeader isOnline={isOnline} />
      <main className="kiosk-content apt-page apt-page--found">
        <div className="apt-banner apt-banner--success">Accepted appointment found for today.</div>
        <div className="apt-heading-block">
          <p className="apt-eyebrow">SERVICE: {appointment?.serviceType}</p>
          <h1 className="apt-heading">You have a scheduled appointment today</h1>
        </div>
        <div className="apt-details-card">
          <p className="apt-details-title">APPOINTMENT DETAILS</p>
          <div className="apt-details-row"><span className="apt-details-label">Service:</span><span className="apt-details-value">{appointment?.serviceType}</span></div>
          {appointment?.purpose && <div className="apt-details-row"><span className="apt-details-label">Purpose:</span><span className="apt-details-value">{appointment.purpose}</span></div>}
          <div className="apt-details-row"><span className="apt-details-label">Date:</span><span className="apt-details-value">{dateLabel}</span></div>
          <div className="apt-details-row"><span className="apt-details-label">Time:</span><span className="apt-details-value">{appointment?.timeSlot}</span></div>
          <div className="apt-details-row"><span className="apt-details-label">Assigned Provider:</span><span className="apt-details-value">{appointment?.assignedProvider?.name || "Not assigned"}</span></div>
        </div>
        <div className="apt-details-card"><p className="apt-hint">You may skip the queue. Please go inside the clinic at your scheduled time.</p></div>
        <button className="apt-btn apt-btn--single" onClick={onDone}>Done</button>
        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ&apos;s)</button>
      </main>
    </div>
  );
}
