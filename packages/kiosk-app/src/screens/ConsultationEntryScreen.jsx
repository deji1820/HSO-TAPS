import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/WalkInConsultation.css";

export default function ConsultationEntryScreen({
  consultSubType,      // "Medical" | "Dental"
  onWalkIn,
  onBookAppointment,   // stub for now
  onBack,
  onFaq,
  isOnline,
}) {
  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />
      <div className="kiosk-content">
        <p className="wic-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
        <h1 className="wic-heading wic-heading--danger">
          NO PRE-SCHEDULED APPOINTMENT FOUND FOR TODAY
        </h1>
        <p className="wic-subtext">How would you like to proceed?</p>

        <div className="wic-choice-row">
          <button className="wic-choice-card" onClick={onWalkIn}>
            <div className="wic-choice-icon">🧑‍⚕️</div>
            <p className="wic-choice-title">Walk-in Consultation</p>
            <p className="wic-choice-desc">
              Join today's clinic walk-in queue for general {consultSubType?.toLowerCase()} assessment.
            </p>
          </button>

          <button className="wic-choice-card" onClick={onBookAppointment}>
            <div className="wic-choice-icon">📅</div>
            <p className="wic-choice-title">Book an Appointment</p>
            <p className="wic-choice-desc">
              Schedule a consultation slot for a future date.
            </p>
          </button>
        </div>

        <button className="wic-back-btn" onClick={onBack}>
          ⬅ Back to service selection
        </button>
        <a className="wic-faq-link" onClick={onFaq}>
          Frequently Asked Questions (FAQ's)
        </a>
      </div>
    </div>
  );
}