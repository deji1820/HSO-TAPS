import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function ClearanceSubmissionQr({ token, purpose }) {
  const [qr, setQr] = useState("");
  const configuredKioskUrl = import.meta.env.VITE_KIOSK_URL?.trim();
  const kioskUrl = configuredKioskUrl || (import.meta.env.DEV ? "http://localhost:5173" : "");
  const submissionUrl = token && kioskUrl ? `${kioskUrl.replace(/\/$/, "")}/?clearanceSubmission=${encodeURIComponent(token)}` : "";
  useEffect(() => {
    let active = true;
    if (!submissionUrl) return undefined;
    QRCode.toDataURL(submissionUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then((value) => { if (active) setQr(value); })
      .catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [submissionUrl]);
  if (!token) return null;
  if (!submissionUrl) return <p className="error-text" role="alert">The public kiosk URL is not configured. Set VITE_KIOSK_URL in the admin portal deployment settings to show a working upload QR code.</p>;
  return <div className="clearance-submission-qr"><div><strong>Submit required documents</strong><p>Scan this code to upload documents for {purpose}. Submissions go to Medical Documents for nurse review.</p><small>{submissionUrl}</small></div>{qr ? <img src={qr} alt={`QR code to submit documents for ${purpose}`} /> : <span role="status">Preparing secure QR code...</span>}</div>;
}
