import { useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/Appointment.css";

const MORNING = ["8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"];
const AFTERNOON = ["1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();

// Default rule: no Sundays, no past dates. Override with the isDateDisabled prop.
const defaultDisabled = (date) => date.getDay() === 0 || date < startOfDay(new Date());

function buildMonthCells(viewMonth) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return { date: d, inMonth: d.getMonth() === viewMonth.getMonth() };
  });
}

function PlaceholderQr() {
  return (
    <svg width="150" height="150" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M6 22V6h16M78 6h16v16M94 78v16H78M22 94H6V78" />
      <rect x="22" y="22" width="20" height="20" />
      <rect x="29" y="29" width="6" height="6" />
      <rect x="58" y="22" width="20" height="20" />
      <rect x="65" y="29" width="6" height="6" />
      <rect x="22" y="58" width="20" height="20" />
      <rect x="29" y="65" width="6" height="6" />
      <path d="M58 58h20v12a10 10 0 0 1-20 0z" />
    </svg>
  );
}

export default function AppointmentBookingScreen({
  consultSubType,            // "Medical" | "Dental"
  unavailableTimes = [],     // e.g. ["9:00 AM"] for the selected date
  isDateDisabled = defaultDisabled,
  qrSrc,                     // optional image URL for the booking QR code
  onProceed,                 // ({ date: Date, time: string }) => void
  onBack,
  onFaq,
  isOnline,
}) {
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  const cells = buildMonthCells(viewMonth);
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  const atCurrentMonth =
    viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();

  const shiftMonth = (delta) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const pickDate = (date) => {
    setSelectedDate(date);
    setSelectedTime(null); // availability can differ per date
  };

  const renderSlots = (slots) =>
    slots.map((t) => (
      <button
        key={t}
        className={`apt-slot${selectedTime === t ? " apt-slot--selected" : ""}`}
        disabled={!selectedDate || unavailableTimes.includes(t)}
        onClick={() => setSelectedTime(t)}
      >
        {t}
      </button>
    ));

  return (
    <div className="kiosk-shell">
      <KioskHeader isOnline={isOnline} />
      <div className="kiosk-content apt-page">
        <p className="apt-eyebrow">SERVICE: {consultSubType?.toUpperCase()} CONSULTATION</p>
        <h1 className="apt-heading">BOOK AN APPOINTMENT</h1>
        <p className="apt-subtext">Choose an available date, then pick a time slot.</p>

        <div className="apt-booking-grid">
          {/* Calendar */}
          <div className="apt-card">
            <div className="apt-cal-head">
              <button className="apt-cal-nav" onClick={() => shiftMonth(-1)} disabled={atCurrentMonth} aria-label="Previous month">‹</button>
              <span className="apt-cal-month">{monthLabel}</span>
              <button className="apt-cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
            </div>
            <div className="apt-cal-grid">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="apt-cal-weekday">{w}</span>
              ))}
              {cells.map(({ date, inMonth }) => (
                <button
                  key={date.toISOString()}
                  className={`apt-day${sameDay(date, selectedDate) ? " apt-day--selected" : ""}`}
                  disabled={!inMonth || isDateDisabled(date)}
                  onClick={() => pickDate(date)}
                >
                  {date.getDate()}
                </button>
              ))}
            </div>
          </div>

          {/* Time slots */}
          <div className="apt-card">
            <p className="apt-card-title">MORNING</p>
            <div className="apt-slot-grid">{renderSlots(MORNING)}</div>
            <p className="apt-card-title apt-card-title--spaced">AFTERNOON</p>
            <div className="apt-slot-grid">{renderSlots(AFTERNOON)}</div>
          </div>

          {/* QR */}
          <div className="apt-card apt-qr-card">
            <p className="apt-card-title">SCAN QR CODE TO BOOK ON YOUR PHONE</p>
            {qrSrc ? <img className="apt-qr-img" src={qrSrc} alt="Booking QR code" /> : <PlaceholderQr />}
          </div>
        </div>

        <div className="apt-actions">
          <button className="apt-btn" onClick={onBack}>⬅ Back to service selection</button>
          <button
            className="apt-btn apt-btn--primary"
            disabled={!selectedDate || !selectedTime}
            onClick={() => onProceed?.({ date: selectedDate, time: selectedTime })}
          >
            Proceed ➡
          </button>
        </div>

        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ's)</button>
      </div>
    </div>
  );
}