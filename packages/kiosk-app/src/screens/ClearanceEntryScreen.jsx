import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/MedicalClearance.css";

export default function ClearanceEntryScreen({ onWalkIn, onBookAppointment, onBack, onFaq, isOnline }) {
  return (
    <div className="kiosk-shell clearance-screen clearance-entry">
      <KioskHeader isOnline={isOnline} />
      <main className="clearance-content">
        <div className="clearance-alert">No pre-scheduled appointment today.</div>
        <div className="clearance-heading">
          <p>SERVICE: MEDICAL CLEARANCE</p>
          <h1>How would you like to proceed?</h1>
        </div>
        <div className="clearance-choice-row">
          <button className="clearance-choice" onClick={onWalkIn}>
            <span className="clearance-choice-icon" aria-hidden="true">👨‍⚕️</span>
            <strong>Walk-in Clearance</strong>
            <span>Join today's clinic walk-in queue for medical clearance.</span>
          </button>
          <button className="clearance-choice" onClick={onBookAppointment}>
            <span className="clearance-choice-icon" aria-hidden="true">📅</span>
            <strong>Book an Appointment</strong>
            <span>Schedule a clearance appointment for a future date.</span>
          </button>
        </div>
        <button className="clearance-back" onClick={onBack}>&lt;&lt; Back</button>
        <a className="clearance-faq" href="#faq" onClick={(event) => { event.preventDefault(); onFaq?.(); }}>
          Frequently Asked Questions (FAQ’s)
        </a>
      </main>
    </div>
  );
}
