import "../styles/components/BloodPressureInstructions.css";

export default function BloodPressureInstructions() {
  return (
    <aside className="qhs-bp-help" aria-label="Blood pressure monitor instructions">
      <h2>How to send your blood pressure reading</h2>
      <ol>
        <li>Wrap the cuff snugly around your upper arm. Align its arrow with the pulse point on the inside of your arm.</li>
        <li>Press <strong>Start</strong> and keep your arm still until the measurement finishes.</li>
        <li>Wait 3 seconds, then press the <strong>Bluetooth</strong> button. Wait for its indicator to blink.</li>
        <li>Press <strong>Start</strong> once to turn the blinking indicator off.</li>
        <li>Press and hold the <strong>Bluetooth</strong> button until the monitor displays <strong>P</strong>.</li>
        <li>Wait for your blood pressure result to appear on the kiosk.</li>
      </ol>
    </aside>
  );
}
