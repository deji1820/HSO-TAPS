import { useEffect, useState } from "react";
import QRCode from "qrcode";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/MedicalClearance.css";

export default function ClearanceResultScreen({ queueNumber, documentSubmissionUrl, onDone, onFaq, isOnline }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    let active = true;
    if (!documentSubmissionUrl) { setQrDataUrl(""); return undefined; }
    QRCode.toDataURL(documentSubmissionUrl, { width: 220, margin: 2, errorCorrectionLevel: "M" })
      .then((value) => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setQrDataUrl(""); });
    return () => { active = false; };
  }, [documentSubmissionUrl]);

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
        {documentSubmissionUrl && <section className="clearance-upload-qr"><h2>Submit required documents</h2><p>Scan to upload the documents for this clearance purpose. The clinic will review your files in Medical Documents.</p>{qrDataUrl ? <img src={qrDataUrl} alt="Secure QR code to upload this medical clearance's required documents" /> : <p>Preparing QR code…</p>}</section>}
        <button className="clearance-done" onClick={onDone}>Done <span>✓</span></button>
        <p className="clearance-autoclose">This screen stays open while you scan the QR code. It returns to the RFID screen after the kiosk inactivity timeout.</p>
        <a className="clearance-faq" href="#faq" onClick={(event) => { event.preventDefault(); onFaq?.(); }}>
          Frequently Asked Questions (FAQ’s)
        </a>
      </main>
    </div>
  );
}
