import { useRef, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/ManualEntry.css";

// Matches PDF screen: "Manual Student ID Entry" — numeric keypad.
// Student IDs follow the "YYYY-NNNNNN" pattern (10 digits total);
// the dash is inserted automatically as the student types.
const MAX_DIGITS = 10;
const DASH_AFTER = 4;

function formatId(digits) {
  if (digits.length <= DASH_AFTER) return digits;
  return `${digits.slice(0, DASH_AFTER)}-${digits.slice(DASH_AFTER)}`;
}

// Ordered to match the PDF grid exactly: 1 2 3 ⌫ / 4 5 6 CLEAR / 7 8 9 0
const KEYS = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "back", label: "⌫", variant: "danger" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "clear", label: "CLEAR", variant: "warning" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: "0", label: "0" },
];

export default function ManualEntryScreen({ onSubmit, onCancel, isOnline }) {
  const [digits, setDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lookupControllerRef = useRef(null);

  const canSubmit = digits.length === MAX_DIGITS && !loading;

  function pressKey(key) {
    if (loading) return;
    setError(null);
    if (key === "back") {
      setDigits((d) => d.slice(0, -1));
    } else if (key === "clear") {
      setDigits("");
    } else if (digits.length < MAX_DIGITS) {
      setDigits((d) => d + key);
    }
  }

  async function handleContinue() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    try {
      await onSubmit(formatId(digits), controller.signal);
    } catch {
      if (!controller.signal.aborted) {
        setError("Student ID could not be verified. Please check the number and try again, or ask the front desk for help.");
      }
    } finally {
      if (lookupControllerRef.current === controller) lookupControllerRef.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleCancel() {
    lookupControllerRef.current?.abort();
    onCancel();
  }

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />

      <div className="kiosk-content">
        <div className="manual-entry-card">
          <div className="manual-entry-titlebar">
            <span>Manual Student ID Entry</span>
            <button className="manual-entry-close" onClick={handleCancel} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="manual-entry-body">
            <div className="manual-entry-label-row">
              <span className="field-label-kiosk">Student ID:</span>
              <span className="manual-entry-format-badge">Format: YYYY-NNNNNN</span>
            </div>

            <div className="id-display">{formatId(digits) || "—"}</div>

            {error && <p className="manual-entry-error">{error}</p>}
            {loading && <p className="manual-entry-loading">Looking up student…</p>}

            <div className="keypad">
              {KEYS.map(({ key, label, variant }) => (
                <button
                  key={key}
                  className={"keypad-key" + (variant ? ` keypad-key-${variant}` : "")}
                  onClick={() => pressKey(key)}
                  disabled={loading}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="manual-entry-actions">
              <button className="btn-kiosk btn-kiosk-muted manual-entry-cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button className="btn-kiosk btn-kiosk-primary manual-entry-confirm" onClick={handleContinue} disabled={!canSubmit}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
