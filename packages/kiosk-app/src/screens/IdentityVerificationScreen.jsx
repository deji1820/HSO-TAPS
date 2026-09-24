import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/IdentityVerification.css";

export default function IdentityVerificationScreen({ student, onProceed, onBack, isOnline }) {
  const fullName = [student?.lastName, student?.firstName, student?.middleName || student?.middleInitial]
    .filter(Boolean)
    .join(", ") || "Unknown Student";

  return (
    <div className="kiosk-shell identity-verification">
      <KioskHeader isOnline={isOnline} />
      <main className="identity-content">
        <section className="identity-heading" aria-labelledby="identity-title">
          <p className="identity-eyebrow">Step 1 of 2: Identity Verification</p>
          <h1 id="identity-title">Is this your profile?</h1>
        </section>

        <article className="identity-card" aria-label="Student profile">
          <h2>{fullName}</h2>
          <p className="identity-student-id">{student?.studentId ?? "—"}</p>
          <div className="identity-divider" />
          <dl className="identity-details">
            <div><dt>Program:</dt><dd>{student?.program ?? "—"}</dd></div>
            <div><dt>Year Level:</dt><dd>{student?.yearLevel ?? "—"}</dd></div>
          </dl>
        </article>

        <div className="identity-actions">
          <button type="button" className="identity-back" onClick={onBack}>&lt;&lt; Back</button>
          <button type="button" className="identity-proceed" onClick={onProceed}>Proceed &gt;&gt;</button>
        </div>
        <a className="identity-faq" href="#faq" onClick={(event) => event.preventDefault()}>
          Frequently Asked Questions (FAQ’s)
        </a>
      </main>
    </div>
  );
}
