import KioskHeader from "../components/KioskHeader.jsx";
import useCountdown from "../hooks/useCountdown.js";
import "../styles/screens/MedicalClearance.css";

export default function ClearanceResultScreen({ queueNumber, onDone, onFaq, isOnline }) {
  const remaining = useCountdown(30, onDone);

  return (
    <div className="kiosk-shell clearance-screen clearance-result">
      <KioskHeader isOnline={isOnline} />
      <main className="clearance-content">
        <div className="clearance-info-banner">Take a picture of the queue number before you leave the kiosk, and wait on the clinic queue.</div>
        <div className="clearance-heading">
          <p>SERVICE: MEDICAL CLEARANCE &gt; WALK-IN CLEARANCE</p>
          <h1>Check-In Complete</h1>
        </div>
        <section className="clearance-queue-card">
          <h2>YOUR QUEUE NUMBER:</h2>
          <strong>{queueNumber ?? "—"}</strong>
        </section>
        <button className="clearance-done" onClick={onDone}>Done <span>✓</span></button>
        <p className="clearance-autoclose">Auto-closes in {remaining}s...</p>
        <a className="clearance-faq" href="#faq" onClick={(event) => { event.preventDefault(); onFaq?.(); }}>
          Frequently Asked Questions (FAQ’s)
        </a>
      </main>
    </div>
  );
}
