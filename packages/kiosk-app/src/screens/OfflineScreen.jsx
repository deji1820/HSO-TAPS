import KioskHeader from "../components/KioskHeader.jsx";
import "../offline.css";

export default function OfflineScreen({ onRetry }) {
  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={false} />

      <div className="kiosk-content offline-clean-container">
        {/* 1. Icon on Top */}
        <div className="offline-top-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>

        {/* 2. Shorter Headline & Subtitle */}
        <h1 className="offline-short-title">Kiosk Temporarily Offline</h1>
        <p className="offline-short-subtitle">
          Automated check-in is unavailable. Please proceed to the clinic front desk.
        </p>

        {/* 3. Clean, Uncrowded Action Card */}
        <div className="offline-simple-card">
          <h3>Please Proceed to the Reception Counter</h3>
          <p>
            Please step inside the <strong>Health Services Office</strong>. A clinic nurse will assist you with manual triage, vitals screening, and consultation registration.
          </p>
        </div>
        <button type="button" className="offline-retry-button" onClick={onRetry}>Retry connection</button>
        <p className="offline-retry-hint">If the system remains offline, clinic staff can complete your check-in at reception.</p>
      </div>
    </div>
  );
}
