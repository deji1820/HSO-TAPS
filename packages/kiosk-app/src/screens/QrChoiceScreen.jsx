import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/QrChoice.css";

export default function QrChoiceScreen({ url, onContinue, onBack, isOnline, preparing = false }) {
  const qrUrl = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`
    : null;

  return (
    <div className="kiosk-shell qr-choice-screen">
      <KioskHeader isOnline={isOnline} />
      <main className="qr-choice-content">
        <p className="qr-choice-step">SERVICE ACCESS</p>
        <h1>Choose how to select your service</h1>
        <p className="qr-choice-description">Scan to continue the full check-in process on your phone, including service selection and any required forms.</p>
        {preparing ? <p className="qr-choice-unavailable">Preparing your secure session QR code…</p> : qrUrl ? (
          <figure className="qr-choice-code">
            <img src={qrUrl} alt="QR code that opens mobile check-in on your phone" />
            <figcaption>Open your phone camera and point it at this code.</figcaption>
          </figure>
        ) : <p className="qr-choice-unavailable">Phone selection is unavailable right now. Continue at the kiosk.</p>}
        <nav className="qr-choice-actions" aria-label="Service access navigation">
          <button className="qr-choice-secondary" onClick={onBack}>Back</button>
          <button className="qr-choice-primary" onClick={onContinue}>Continue at this kiosk</button>
        </nav>
        <p className="qr-choice-help">Keep this kiosk session open while you complete check-in on your phone.</p>
      </main>
    </div>
  );
}
