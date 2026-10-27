import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function ClearanceSubmissionQr({ token, purpose }) {
  const [qr, setQr] = useState("");
  const kioskUrl = import.meta.env.VITE_KIOSK_URL || window.location.origin;
  const submissionUrl = token ? `${kioskUrl.replace(/\/$/, "")}/?clearanceSubmission=${encodeURIComponent(token)}` : "";
  useEffect(() => {
    let active = true;
    if (!submissionUrl) return undefined;
    QRCode.toDataURL(submissionUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then((value) => { if (active) setQr(value); })
      .catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [submissionUrl]);
  if (!token) return null;
  return <div className="clearance-submission-qr"><div><strong>Submit required documents</strong><p>Scan this code to upload documents for {purpose}. Submissions go to Medical Documents for review.</p><small>{submissionUrl}</small></div>{qr ? <img src={qr} alt={`QR code to submit documents for ${purpose}`} /> : <span role="status">Preparing secure QR code…</span>}</div>;
}
