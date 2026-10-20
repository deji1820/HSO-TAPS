import KioskHeader from "../components/KioskHeader.jsx";

const FAQS = [
  ["How do I book a medical clearance appointment?", "Choose Medical Clearance, select the appointment option, pick a purpose and available time, then save the appointment details."],
  ["What documents should I bring for medical clearance?", "Review the required document list for your clearance purpose before proceeding. Bring the listed original or accepted copies to the clinic."],
  ["What should I do if a kiosk sensor cannot get a reading?", "Follow the on-screen position instructions and hold still. If the kiosk still cannot capture a result, ask clinic staff for assistance."],
  ["How do I take a blood pressure reading?", [
    "Wrap the cuff snugly around your upper arm. Align its arrow with the pulse point on the inside of your arm.",
    "Press Start and keep your arm still until the measurement finishes.",
    "Wait 3 seconds, then press the Bluetooth button. Wait for its indicator to blink.",
    "Press Start once to turn the blinking indicator off.",
    "Press and hold the Bluetooth button until the monitor displays P.",
    "Wait for your blood pressure result to appear on the kiosk.",
  ]],
  ["Can I use the kiosk for a walk-in visit?", "Yes. Choose the relevant clinic service and follow the prompts. For urgent concerns, speak to clinic staff directly."],
  ["When should I take a photo of my result?", "The result screen asks you to photograph the summary before leaving the kiosk. The kiosk closes the result screen automatically."],
];

export default function KioskFaqScreen({ onBack, isOnline }) {
  return <div className="kiosk-shell qhs-reading-screen">
    <KioskHeader isOnline={isOnline} />
    <main className="qhs-reading-content kiosk-faq-content">
      <div className="qhs-reading-heading"><p>NU FAIRVIEW HEALTH SERVICES OFFICE</p><h1>Frequently Asked Questions</h1></div>
      <section className="qhs-reading-panel kiosk-faq-list">
        {FAQS.map(([question, answer]) => <details key={question}><summary>{question}</summary>{Array.isArray(answer) ? <ol className="kiosk-faq-bp-steps">{answer.map((step) => <li key={step}>{step}</li>)}</ol> : <p>{answer}</p>}</details>)}
      </section>
      <button className="qhs-done qhs-back" onClick={onBack}>&lt;&lt; Back</button>
    </main>
  </div>;
}
