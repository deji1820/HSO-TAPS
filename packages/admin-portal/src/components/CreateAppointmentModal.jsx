import { useEffect, useMemo, useState } from "react";
import {
  createStaffAppointment,
  getClearanceRequirements,
  getStaffAppointmentAvailability,
  getStaffAppointmentSchedule,
  searchAppointmentPatients,
} from "../services/api.js";
import "../styles/components/CreateAppointmentModal.css";

const SERVICES = ["Medical Consultation", "Dental Consultation", "Medical Clearance", "Prescription & Medicine Request"];

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function makeSlots(serviceType) {
  const end = ["Medical Consultation", "Dental Consultation"].includes(serviceType) ? 16 * 60 : 21 * 60;
  return Array.from({ length: (end - 8 * 60) / 30 }, (_, index) => {
    const minutes = 8 * 60 + index * 30;
    const hours24 = Math.floor(minutes / 60);
    return `${hours24 % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours24 < 12 ? "AM" : "PM"}`;
  });
}

export default function CreateAppointmentModal({ onClose, onCreated }) {
  const [serviceType, setServiceType] = useState(SERVICES[0]);
  const [purpose, setPurpose] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [patient, setPatient] = useState(null);
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [weekdays, setWeekdays] = useState([]);
  const [unavailableTimes, setUnavailableTimes] = useState([]);
  const [availabilityError, setAvailabilityError] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [purposes, setPurposes] = useState([]);

  const slots = useMemo(() => makeSlots(serviceType), [serviceType]);
  const isClearance = serviceType === "Medical Clearance";
  const patientAffiliation = patient?.affiliation || "Student";
  const eligiblePurposes = purposes.filter((item) => item.affiliation === patientAffiliation && item.clearance);

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  useEffect(() => {
    let active = true;
    setLoadingSchedule(true);
    setWeekdays([]);
    setDate("");
    setTimeSlot("");
    setAvailabilityError("");
    getStaffAppointmentSchedule(serviceType)
      .then((schedule) => { if (active) setWeekdays(schedule.weekdays || []); })
      .catch((requestError) => { if (active) setAvailabilityError(requestError.response?.data?.message || "Could not load this service's booking schedule."); })
      .finally(() => { if (active) setLoadingSchedule(false); });
    return () => { active = false; };
  }, [serviceType]);

  useEffect(() => {
    let active = true;
    setPurpose("");
    setError("");
    if (!isClearance) { setPurposes([]); return () => { active = false; }; }
    getClearanceRequirements()
      .then(({ items = [] }) => { if (active) setPurposes(items); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || "Could not load clearance purposes."); });
    return () => { active = false; };
  }, [isClearance]);

  useEffect(() => {
    const query = patientQuery.trim();
    if (patient || query.length < 2) { setPatients([]); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchAppointmentPatients(query)
        .then(({ items = [] }) => { if (active) setPatients(items); })
        .catch((requestError) => { if (active) setError(requestError.response?.data?.message || "Could not search patient records."); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [patientQuery, patient]);

  useEffect(() => {
    let active = true;
    setUnavailableTimes([]);
    setAvailabilityError("");
    setTimeSlot("");
    if (!date) return () => { active = false; };
    getStaffAppointmentAvailability(serviceType, date)
      .then(({ unavailableTimes: unavailable = [] }) => { if (active) setUnavailableTimes(unavailable); })
      .catch((requestError) => {
        if (active) setAvailabilityError(requestError.response?.data?.message || "No availability is configured for this date. Choose another date.");
      });
    return () => { active = false; };
  }, [serviceType, date]);

  function choosePatient(item) {
    setPatient(item);
    setPatientQuery([item.firstName, item.lastName, item.studentId || item.employeeId].filter(Boolean).join(" · "));
    setEmail(item.email || "");
    setPatients([]);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!patient || !date || !timeSlot || (isClearance && !purpose)) return;
    setSaving(true);
    setError("");
    try {
      const result = await createStaffAppointment({
        studentId: patient.studentId || patient.employeeId,
        serviceType,
        purpose: isClearance ? purpose : undefined,
        date,
        timeSlot,
        notificationEmail: email.trim().toLowerCase(),
      });
      onCreated(result);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not create the appointment. Please review the details and try again.");
      if (requestError.response?.status === 409) {
        getStaffAppointmentAvailability(serviceType, date).then(({ unavailableTimes = [] }) => setUnavailableTimes(unavailableTimes)).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="create-appointment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="create-appointment-modal" role="dialog" aria-modal="true" aria-labelledby="create-appointment-title">
        <header className="create-appointment-header">
          <div><p>BOOKING APPOINTMENTS</p><h2 id="create-appointment-title">Create an Appointment</h2></div>
          <button type="button" className="create-appointment-close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        </header>
        <form onSubmit={submit}>
          <div className="create-appointment-fields">
            <label className="create-appointment-wide">Patient
              <input className="text-input" value={patientQuery} onChange={(event) => { setPatient(null); setPatientQuery(event.target.value); setEmail(""); setError(""); }} placeholder="Search by name, student or employee ID" autoComplete="off" required />
              {searching && <small>Searching patient records…</small>}
              {!patient && patients.length > 0 && <div className="create-appointment-patient-results" role="listbox" aria-label="Matching patients">{patients.map((item) => <button key={item._id} type="button" role="option" onClick={() => choosePatient(item)}><strong>{item.firstName} {item.lastName}</strong><span>{item.employeeId || item.studentId} · {item.affiliation}</span></button>)}</div>}
              {!patient && patientQuery.trim().length >= 2 && !searching && !patients.length && <small>No matching active patient found.</small>}
            </label>
            {patient && <p className="create-appointment-patient-summary create-appointment-wide">Selected: <strong>{patient.firstName} {patient.lastName}</strong> ({patient.employeeId || patient.studentId}) · {patient.affiliation}</p>}
            <label>Service
              <select className="text-input" value={serviceType} onChange={(event) => { setServiceType(event.target.value); setDate(""); setTimeSlot(""); }}>
                {SERVICES.map((service) => <option key={service}>{service}</option>)}
              </select>
            </label>
            {isClearance && <label>Clearance purpose
              <select className="text-input" value={purpose} onChange={(event) => setPurpose(event.target.value)} required>
                <option value="">Select purpose</option>{eligiblePurposes.map((item) => <option key={item.purpose} value={item.purpose}>{item.purpose}</option>)}
              </select>
            </label>}
            <label>Date
              <input className="text-input" type="date" min={todayKey()} value={date} onChange={(event) => setDate(event.target.value)} required disabled={loadingSchedule} />
              {!!weekdays.length && <small>Available weekdays: {weekdays.map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]).join(", ")}</small>}
            </label>
            <label>Time
              <select className="text-input" value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} required disabled={!date || !!availabilityError}>
                <option value="">Select available time</option>{slots.map((slot) => <option key={slot} value={slot} disabled={unavailableTimes.includes(slot)}>{slot}{unavailableTimes.includes(slot) ? " · Unavailable" : ""}</option>)}
              </select>
            </label>
            <label className="create-appointment-wide">Notification email
              <input className="text-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="patient@school.edu" />
              <small>Booking updates will be sent to this address.</small>
            </label>
          </div>
          {availabilityError && <p className="create-appointment-error" role="alert">{availabilityError}</p>}
          {error && <p className="create-appointment-error" role="alert">{error}</p>}
          <p className="create-appointment-note">This appointment will follow the existing review process and be created as Pending Review.</p>
          <footer className="create-appointment-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !patient || !date || !timeSlot || !!availabilityError || loadingSchedule}>{saving ? "Creating…" : "Create Appointment"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
