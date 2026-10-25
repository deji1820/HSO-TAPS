import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAppointment } from "../services/api.js";
import { normalizeRole } from "../utils/roles.js";
import "../styles/pages/AppointmentDetails.css";

function valueOrDash(value) { return value || "—"; }

function displayDate(dateKey) {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString([], { dateStyle: "full" });
}

function displayTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function LabelValue({ label, children }) {
  return <div className="appointment-detail-field"><dt>{label}</dt><dd>{children}</dd></div>;
}

function Status({ value, group }) {
  const label = value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
  return <span className={`appointment-badge appointment-badge--${group}-${value || "unknown"}`}>{label}</span>;
}

export default function AppointmentDetailsPage({ user }) {
  const { appointmentId } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAppointment = useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAppointment(appointmentId)
      .then(({ appointment: result }) => { if (active) setAppointment(result); })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load this appointment. Try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId]);

  useEffect(() => loadAppointment(), [loadAppointment]);

  if (loading) return <main className="appointment-details-page"><p className="table-empty" role="status">Loading appointment details…</p></main>;
  if (error) return <main className="appointment-details-page"><Link className="appointment-back-link" to="/appointments">← Appointments</Link><div className="appointments-error" role="alert"><span>{error}</span><button type="button" className="btn btn-outline btn-sm" onClick={loadAppointment}>Try again</button></div></main>;
  if (!appointment) return null;

  const patient = appointment.student;
  const name = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") : "Patient record unavailable";
  const patientIdentifier = patient?.employeeId || patient?.studentId;
  const canViewEmr = ["nurse", "supervisor", "physician", "dentist"].includes(normalizeRole(user?.role));
  const decision = appointment.decisionStatus || "pending";

  return (
    <main className="appointment-details-page">
      <nav className="appointment-detail-breadcrumb" aria-label="Breadcrumb"><Link to="/appointments">Appointments</Link><span aria-hidden="true">/</span><span>Appointment details</span></nav>
      <header className="appointment-detail-heading">
        <div>
          <Link className="appointment-back-link" to="/appointments">← Back to Appointments</Link>
          <h1>Appointment Details</h1>
          <p>Record ID <code>{appointment._id}</code></p>
        </div>
        <div className="appointment-detail-statuses"><Status value={decision} group="decision" /><Status value={appointment.status} group="booking" /></div>
      </header>

      <div className="appointment-detail-layout">
        <div className="appointment-detail-main">
          <section className="appointment-detail-card" aria-labelledby="appointment-patient-title">
            <h2 id="appointment-patient-title">Patient Information</h2>
            <div className="appointment-detail-patient"><div className="appointment-detail-avatar" aria-hidden="true">{name === "Patient record unavailable" ? "?" : name.charAt(0).toUpperCase()}</div><div><h3>{name}</h3><p>{valueOrDash(patientIdentifier)}</p></div></div>
            <dl className="appointment-detail-grid">
              <LabelValue label="Affiliation">{valueOrDash(patient?.affiliation)}</LabelValue>
              <LabelValue label="Program / Department">{valueOrDash(patient?.program || patient?.department)}</LabelValue>
              <LabelValue label="School email">{valueOrDash(patient?.email)}</LabelValue>
            </dl>
            {canViewEmr && patient?.studentId && <Link className="btn btn-outline btn-sm" to={`/emr?studentId=${encodeURIComponent(patient.studentId)}`}>Open patient EMR</Link>}
          </section>

          <section className="appointment-detail-card" aria-labelledby="appointment-summary-title">
            <h2 id="appointment-summary-title">Appointment Summary</h2>
            <dl className="appointment-detail-grid">
              <LabelValue label="Service">{valueOrDash(appointment.serviceType)}</LabelValue>
              <LabelValue label="Purpose">{valueOrDash(appointment.purpose)}</LabelValue>
              <LabelValue label="Date">{displayDate(appointment.dateKey)}</LabelValue>
              <LabelValue label="Time">{valueOrDash(appointment.timeSlot)}</LabelValue>
              <LabelValue label="Booking status"><Status value={appointment.status} group="booking" /></LabelValue>
              <LabelValue label="Decision"><Status value={decision} group="decision" /></LabelValue>
              <LabelValue label="Created">{displayTimestamp(appointment.createdAt)}</LabelValue>
              <LabelValue label="Last updated">{displayTimestamp(appointment.updatedAt)}</LabelValue>
            </dl>
          </section>

          <section className="appointment-detail-card" aria-labelledby="appointment-not-recorded-title">
            <h2 id="appointment-not-recorded-title">Additional workflow information</h2>
            <p className="appointment-detail-muted">Provider and room assignments, appointment event history, attendance timestamps, and email delivery logs are not currently stored on this appointment record, so they are not shown here.</p>
          </section>
        </div>
        <aside className="appointment-detail-aside" aria-label="Appointment actions">
          <section className="appointment-detail-card">
            <h2>Actions</h2>
            {canViewEmr && patient?.studentId ? <Link className="btn btn-primary appointment-detail-action" to={`/emr?studentId=${encodeURIComponent(patient.studentId)}`}>Open Patient EMR</Link> : <p className="appointment-detail-muted">No additional action is available for this record.</p>}
            <Link className="btn btn-outline appointment-detail-action" to="/appointments">Return to Appointments</Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
