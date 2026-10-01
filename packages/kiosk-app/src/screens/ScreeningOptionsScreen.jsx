import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/ServiceGrid.css";
import "../styles/screens/Screening.css";

const OPTIONS = [
  { mode: "complete", label: "Complete Screening", desc: "Self-Service Body Temperature, Blood Pressure, Height, Weight & BMI Calculation.", icon: "🩺" },
  { mode: "temperature", label: "Temperature Screening Only", desc: "Height and Weight Intake. BMI Calculation.", icon: "🌡️" },
  { mode: "bloodPressure", label: "Blood Pressure Screening Only", desc: "Blood Pressure Intake.", icon: "🩸" },
  { mode: "bmi", label: "BMI Screening Only", desc: "For OTC medicines and prescription requests.", icon: "📏" },
];

export default function ScreeningOptionsScreen({ onSelect, onBack, onFaq, isOnline }) {
  return (
    <div className="kiosk-shell qhs-options-screen">
      <KioskHeader isOnline={isOnline} />
      <div className="kiosk-content service-grid-content qhs-options">
        <p className="kiosk-eyebrow">SERVICE: QUICK HEALTH SCREENING</p>
        <h1>What would you like to check?</h1>
        <div className="card-grid">
          {OPTIONS.map((option) => (
            <button key={option.mode} className="service-card" onClick={() => onSelect(option.mode)}>
              <div className="service-card-icon" aria-hidden="true">{option.icon}</div>
              <h3>{option.label}</h3>
              <p>{option.desc}</p>
            </button>
          ))}
        </div>
        <button className="service-grid-back-btn" onClick={onBack}>&lt;&lt; Back</button>
        <a className="qhs-faq" href="#faq" onClick={(event) => { event.preventDefault(); onFaq?.(); }}>Frequently Asked Questions (FAQ’s)</a>
      </div>
    </div>
  );
}
