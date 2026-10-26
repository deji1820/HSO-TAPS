import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/Confirm.css";

// Matches PDF screen: "Step 1 of 2: Identity Verification" — shown right
// after a successful RFID tap or Manual Entry lookup, before service
// selection (which the PDF labels "Step 2 of 2", see ServiceSelectScreen).
export default function ConfirmScreen({ student, onConfirm, onNotMe, isOnline }) {
  const fullName = [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Unknown Student";

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />

      <div className="kiosk-content">
        <p className="kiosk-eyebrow">Step 1 of 2: Identity Verification</p>
        <h1>Is this your profile?</h1>

        <div className="confirm-card">
          <h2 className="confirm-name">{fullName}</h2>
          <p className="confirm-id">{student?.studentId ?? "—"}</p>

          <div className="confirm-divider" />

          <div className="confirm-detail-row">
            <span className="confirm-detail-label">Program:</span>
            <span className="confirm-detail-value">{student?.program ?? "—"}</span>
          </div>
          <div className="confirm-detail-row">
            <span className="confirm-detail-label">Year Level:</span>
            <span className="confirm-detail-value">{student?.displayYearLevel || student?.yearLevel || "—"}</span>
          </div>
        </div>

        <div className="confirm-actions">
          <button className="btn-kiosk confirm-btn confirm-btn-no" onClick={onNotMe}>
            ✕ No, Cancel
          </button>
          <button className="btn-kiosk confirm-btn confirm-btn-yes" onClick={onConfirm}>
            Yes, Proceed →
          </button>
        </div>
      </div>
    </div>
  );
}
