import { useEffect, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import { getAppointmentAvailability, getAppointmentSchedule } from "../services/api.js";
import "../styles/screens/Appointment.css";

function makeSlots(timeWindows, fallbackEnd) {
  const windows = timeWindows?.length ? timeWindows : [{ startTime: "08:00", endTime: fallbackEnd }];
  const values = new Set();
  windows.forEach(({ startTime, endTime }) => {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    for (let totalMinutes = startHour * 60 + startMinute; totalMinutes + 30 <= endHour * 60 + endMinute; totalMinutes += 30) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour = hour24 % 12 || 12;
      values.add(`${hour}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`);
    }
  });
  return [...values];
}
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_SCHEDULES = [
  { label: "Medical Consultation", days: "Monday–Friday", weekdays: [1, 2, 3, 4, 5] },
  { label: "Dental Consultation", days: "Wednesday & Friday", weekdays: [3, 5] },
  { label: "Medical Clearance", days: "Monday–Saturday", weekdays: [1, 2, 3, 4, 5, 6] },
  { label: "Prescription & Medicine Request", days: "Monday–Saturday", weekdays: [1, 2, 3, 4, 5, 6] },
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();
const displayScheduleTime = (value) => {
  const [hours, minutes] = value.split(":").map(Number);
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

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
  serviceLabel,
  serviceType,
  purpose,
  schoolEmail = "",
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
  const [serverUnavailable, setServerUnavailable] = useState([]);
  const [providerWeekdays, setProviderWeekdays] = useState(null);
  const [providerTimeWindows, setProviderTimeWindows] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(schoolEmail);

  const serviceSchedule = DAY_SCHEDULES.find(({ label }) => label === serviceType);
  const isProviderScheduledService = ["Medical Consultation", "Dental Consultation", "Medical Clearance", "Prescription & Medicine Request"].includes(serviceType);
  const allowedWeekdays = isProviderScheduledService ? providerWeekdays : serviceSchedule?.weekdays;
  const scheduleDayLabel = providerWeekdays !== null
    ? providerWeekdays.length
      ? providerWeekdays.map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]).join(", ")
      : "No provider days configured"
    : serviceSchedule?.days || "No days available";
  const cells = buildMonthCells(viewMonth);
  const fallbackEnd = ["Medical Consultation", "Dental Consultation"].includes(serviceType) ? "16:00" : "21:00";
  const slots = makeSlots(providerTimeWindows, fallbackEnd);
  const morningSlots = slots.filter((slot) => slot.endsWith("AM"));
  const afternoonSlots = slots.filter((slot) => slot.endsWith("PM"));
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  const atCurrentMonth =
    viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();

  const selectedDateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : "";

  useEffect(() => {
    if (!isProviderScheduledService) { setProviderWeekdays(null); setProviderTimeWindows(null); setScheduleError(""); return undefined; }
    let active = true;
    setScheduleLoading(true);
    setScheduleError("");
    getAppointmentSchedule(serviceType)
      .then(({ weekdays = [], timeWindows = [] }) => { if (active) { setProviderWeekdays(weekdays); setProviderTimeWindows(timeWindows); } })
      .catch(() => { if (active) { setProviderWeekdays([]); setProviderTimeWindows([]); setScheduleError("Could not load clinic hours. Please try again before booking."); } })
      .finally(() => { if (active) setScheduleLoading(false); });
    return () => { active = false; };
  }, [serviceType, isProviderScheduledService]);

  useEffect(() => {
    let active = true;
    setServerUnavailable([]);
    setAvailabilityError("");
    if (!selectedDateKey || !serviceType) return () => { active = false; };
    getAppointmentAvailability(serviceType, selectedDateKey)
      .then(({ unavailableTimes = [] }) => { if (active) setServerUnavailable(unavailableTimes); })
      .catch(() => { if (active) setAvailabilityError("Could not load available times. Check the connection and choose the date again."); });
    return () => { active = false; };
  }, [selectedDateKey, serviceType]);

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
        disabled={!selectedDate || unavailableTimes.includes(t) || serverUnavailable.includes(t)}
        onClick={() => setSelectedTime(t)}
      >
        {t}
      </button>
    ));

  return (
    <div className="kiosk-shell apt-screen apt-screen--booking">
      <KioskHeader isOnline={isOnline} />
      <main className="kiosk-content apt-page apt-page--booking">
        <p className="apt-eyebrow">SERVICE: {serviceLabel || `${consultSubType?.toUpperCase()} CONSULTATION`}{serviceLabel ? " > BOOK AN APPOINTMENT" : ""}</p>
        <h1 className="apt-heading">Select your preferred date and time</h1>

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
                  disabled={!inMonth || scheduleLoading || isDateDisabled(date) || !allowedWeekdays?.includes(date.getDay())}
                  onClick={() => pickDate(date)}
                >
                  {date.getDate()}
                </button>
              ))}
            </div>
          </div>

          {/* Time slots */}
          <div className="apt-card apt-time-card">
            <p className="apt-card-title">MORNING</p>
            <div className="apt-slot-grid">{renderSlots(morningSlots)}</div>
            <p className="apt-card-title apt-card-title--spaced">AFTERNOON{fallbackEnd === "21:00" ? " & EVENING · UNTIL 9:00 PM" : " · UNTIL 4:00 PM"}</p>
            <div className="apt-slot-grid">{renderSlots(afternoonSlots)}</div>
          </div>

          <aside className="apt-card apt-schedule-guide" aria-label="Appointment schedule guide">
            <h2 className="apt-card-title">BOOKING DAYS</h2>
            <ul>
              {DAY_SCHEDULES.map(({ label, days }) => (
                <li key={label} className={label === serviceType ? "apt-schedule-guide-current" : ""}>
                  <strong>{label}</strong><span>{label === serviceType ? scheduleDayLabel : days}</span>
                </li>
              ))}
            </ul>
            {scheduleError && <p className="appointment-error" role="alert">{scheduleError}</p>}
            <p>Available appointment hours: 8:00 AM–{fallbackEnd === "16:00" ? "4:00 PM" : "9:00 PM"}. Time slots are 30 minutes.</p>
          </aside>

        </div>

        <div className="apt-email-field">
          {schoolEmail ? <p>Appointment updates will be sent to your saved school email: <strong>{schoolEmail}</strong>.</p> : <>
            <label htmlFor="appointment-school-email">School email (Outlook)</label>
            <input
              id="appointment-school-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@school.edu"
              required
            />
            <p>We’ll save this for future document submissions and email you when the Health Services Office accepts or rejects this appointment.</p>
          </>}
        </div>

        <div className="apt-actions">
          <button className="apt-btn apt-btn--back" onClick={onBack}>&lt;&lt; Back</button>
          <button
            className="apt-btn apt-btn--primary"
            disabled={!selectedDate || !selectedTime || saving || !!availabilityError}
            onClick={async () => {
              setSaving(true);
              setAvailabilityError("");
              try {
                const recipientEmail = schoolEmail || email.trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
                  setAvailabilityError("Enter a valid school email address to receive your appointment decision.");
                  return;
                }
                await onProceed?.({ date: selectedDate, time: selectedTime, dateKey: selectedDateKey, purpose, notificationEmail: recipientEmail });
              } catch (error) {
                setSelectedTime(null);
                setAvailabilityError(error?.response?.data?.message || "Could not save this appointment. Please try again.");
                if (error?.response?.status === 409) {
                  getAppointmentAvailability(serviceType, selectedDateKey)
                    .then(({ unavailableTimes = [] }) => setServerUnavailable(unavailableTimes))
                    .catch(() => {});
                }
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Proceed >>"}
          </button>
        </div>

        {availabilityError && <p className="apt-autoclose" role="alert">{availabilityError}</p>}

        <button className="apt-faq" onClick={onFaq}>Frequently Asked Questions (FAQ's)</button>
      </main>
    </div>
  );
}
