import KioskHeader from "../components/KioskHeader.jsx";

const FAQS = [
  ["How do I book a medical clearance appointment?", "Choose Medical Clearance, select the appointment option, pick a purpose and available time, then save the appointment details."],
  ["What documents should I bring for medical clearance?", "Review the required document list for your clearance purpose before proceeding. Bring the listed original or accepted copies to the clinic."],
  ["What should I do if a kiosk sensor cannot get a reading?", "Follow the on-screen position instructions and hold still. If the kiosk still cannot capture a result, ask clinic staff for assistance."],
  ["How do I take a blood pressure reading?", "Insert your left arm into the cuff on the left side of the kiosk and hold steady until the measurement completes. The screen displays blood pressure and pulse when available."],
  ["Can I use the kiosk for a walk-in visit?", "Yes. Choose the relevant clinic service and follow the prompts. For urgent concerns, speak to clinic staff directly."],
  ["When should I take a photo of my result?", "The result screen asks you to photograph the summary before leaving the kiosk. The kiosk closes the result screen automatically."],
];

export default function KioskFaqScreen({ onBack, isOnline }) {
  return <div className="kiosk-shell qhs-reading-screen">
    <KioskHeader isOnline={isOnline} />
    <main className="qhs-reading-content kiosk-faq-content">
      <div className="qhs-reading-heading"><p>NU FAIRVIEW HEALTH SERVICES OFFICE</p><h1>Frequently Asked Questions</h1></div>
      <section className="qhs-reading-panel kiosk-faq-list">
        {FAQS.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
      </section>
      <button className="qhs-done qhs-back" onClick={onBack}>&lt;&lt; Back</button>
    </main>
  </div>;
}
