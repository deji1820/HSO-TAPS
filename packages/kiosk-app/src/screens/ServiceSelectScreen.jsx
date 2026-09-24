import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/ServiceSelect.css";

// `value` must exactly match the QueueEntry.serviceType enum in
// packages/server/src/models/QueueEntry.js. `title` is display-only.
const SERVICES = [
  {
    value: "Medical Consultation",
    title: "Medical Consultation",
    desc: "For general health check-ups and medical conditions.",
    icon: "\u{1F468}\u200D\u2695\uFE0F",
  },
  {
    value: "Dental Consultation",
    title: "Dental Consultation",
    desc: "For oral check-ups and dental concerns.",
    icon: "\u{1F9B7}",
  },
  {
    value: "Medical Clearance",
    title: "Medical Clearance",
    desc: "For official health clearances and medical document verification.",
    icon: "\u{1F4CB}",
  },
  {
    value: "Prescription/OTC Pickup",
    title: "Prescription & Medicine",
    desc: "For OTC medicines and prescription requests.",
    icon: "\u{1F48A}",
  },
  {
    value: "Quick Health Screening",
    title: "Quick Health Screening",
    desc: "Self-Service Body Temperature, Blood Pressure, Height, Weight & BMI Calculation.",
    icon: "\u{1F9BA}",
  },
];

export default function ServiceSelectScreen({ onSelect, onBack, onFaq, isOnline }) {
  return (
    <div className="kiosk-shell ss">
      <KioskHeader isOnline={isOnline} />

      <div className="ss-content">
        <p className="ss-eyebrow">Step 2 of 2: Service Selection</p>
        <h1 className="ss-title">What is the purpose of your visit?</h1>

        <div className="ss-grid">
          {SERVICES.map((s) => (
            <button key={s.value} className="ss-card" onClick={() => onSelect(s.value)}>
              <div className="ss-card-icon">{s.icon}</div>
              <h3 className="ss-card-title">{s.title}</h3>
              <p className="ss-card-desc">{s.desc}</p>
            </button>
          ))}
        </div>

        <button className="ss-cancel" onClick={onBack}>
          &lt;&lt; Back
        </button>

        <button className="ss-faq" onClick={onFaq}>
          Frequently Asked Questions (FAQ's)
        </button>
      </div>
    </div>
  );
}