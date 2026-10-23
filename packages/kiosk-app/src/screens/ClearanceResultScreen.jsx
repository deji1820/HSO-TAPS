import KioskHeader from "../components/KioskHeader.jsx";
import useCountdown from "../hooks/useCountdown.js";
import "../styles/screens/MedicalClearance.css";

export default function ClearanceResultScreen({ queueNumber, onDone, onFaq, isOnline }) {
  const remaining = useCountdown(30, onDone);

  return (
    <div className="kiosk-shell clearance-screen clearance-result">
      <KioskHeader isOnline={isOnline} />
      <main className="clearance-content">
        <div className="clearance-info-banner">You have joined the Medical Clearance queue. Take a picture of your number and wait for it to appear under Now Serving on the Clinic Queue board.</div>
        <div className="clearance-heading">
          <p>SERVICE: MEDICAL CLEARANCE &gt; WALK-IN CLEARANCE</p>
          <h1>You're in the queue</h1>
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
