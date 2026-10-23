import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/ProfileCompletion.css";

export default function ProfileCompletionAccessScreen({ url, preparing, onContinueAtKiosk, isOnline }) {
  const qrUrl = url ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}` : null;
  return (
    <div className="kiosk-shell profile-access-shell">
      <KioskHeader isOnline={isOnline} />
      <main className="profile-access-content">
        <p className="profile-completion-eyebrow">STEP 2 OF 3 · REQUIRED PROFILE SETUP</p>
        <h1>Complete your profile on your phone</h1>
        <p>Scan this QR code to fill in your basic information from your phone. The kiosk will continue when you save.</p>
        {preparing ? <p className="profile-access-wait">Preparing your secure profile link…</p> : qrUrl ? (
          <figure className="profile-access-qr"><img src={qrUrl} alt="QR code to complete your profile on a phone" /><figcaption>Keep this kiosk session open while you complete the form.</figcaption></figure>
        ) : <p className="profile-access-wait">Phone form unavailable. Please continue on this kiosk or ask clinic staff for assistance.</p>}
        <button type="button" className="profile-primary" onClick={onContinueAtKiosk}>Continue on this kiosk</button>
      </main>
    </div>
  );
}
