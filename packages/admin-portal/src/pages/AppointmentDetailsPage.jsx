import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { assignAppointmentProvider, checkInAppointment, getAppointment, getAppointmentNotifications, getProviderOptions, retryAppointmentEmail, updateAppointmentDecision, updateAppointmentNoShowException } from "../services/api.js";
import { normalizeRole } from "../utils/roles.js";
import "../styles/pages/AppointmentDetails.css";
import { appDialog } from "../../../shared-ui/src/dialogService.js";

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

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function LabelValue({ label, children }) {
  return <div className="appointment-detail-field"><dt>{label}</dt><dd>{children}</dd></div>;
}

function Status({ value, group }) {
  const label = value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
  return <span className={`appointment-badge appointment-badge--${group}-${value || "unknown"}`}>{label}</span>;
}

function notificationTypeLabel(type) {
  return ({ booking_received: "Booking acknowledgment", decision_accepted: "Appointment accepted", decision_rejected: "Appointment rejected" })[type] || "Appointment email";
}

function attendanceStatus(appointment) {
  if (appointment.status === "checked_in") return "Checked In";
  if (appointment.status === "no_show") return "No-show";
  if (appointment.status === "completed") return "Completed";
  if (appointment.status === "cancelled") return "Not applicable (cancelled)";
  return "Not Arrived";
}

export default function AppointmentDetailsPage({ user }) {
  const { appointmentId } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [encounter, setEncounter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInNotice, setCheckInNotice] = useState("");
  const [providerOptions, setProviderOptions] = useState([]);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [providerSchedule, setProviderSchedule] = useState(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState("");
  const [retryingNotificationId, setRetryingNotificationId] = useState("");

  const loadAppointment = useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAppointment(appointmentId)
      .then(({ appointment: result, encounter: linkedEncounter, providerSchedule: schedule }) => { if (active) { setAppointment(result); setEncounter(linkedEncounter); setProviderSchedule(schedule); } })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load this appointment. Try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId]);

  useEffect(() => loadAppointment(), [loadAppointment]);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const result = await getAppointmentNotifications(appointmentId);
      setNotifications(result.items || []);
    } catch (requestError) {
      setNotificationsError(requestError.response?.data?.message || "Could not load appointment email history.");
    } finally {
      setNotificationsLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const canAssignProvider = ["nurse", "supervisor", "staff"].includes(normalizeRole(user?.role));
  useEffect(() => {
    if (!appointment || !canAssignProvider || appointment.status !== "scheduled" || appointment.decisionStatus !== "accepted" || !["Medical Consultation", "Dental Consultation"].includes(appointment.serviceType)) {
      setProviderOptions([]);
      setProviderConfigured(false);
      return undefined;
    }
    let active = true;
    getProviderOptions({ serviceType: appointment.serviceType, date: appointment.dateKey, timeSlot: appointment.timeSlot, excludeAppointmentId: appointment._id })
      .then((result) => { if (active) { setProviderOptions(result.providers || []); setProviderConfigured(Boolean(result.configured)); } })
      .catch(() => { if (active) { setProviderOptions([]); setProviderConfigured(false); } });
    return () => { active = false; };
  }, [appointment, canAssignProvider]);

  if (loading) return <main className="appointment-details-page"><p className="table-empty" role="status">Loading appointment details…</p></main>;
  if (error) return <main className="appointment-details-page"><Link className="appointment-back-link" to="/appointments">← Appointments</Link><div className="appointments-error" role="alert"><span>{error}</span><button type="button" className="btn btn-outline btn-sm" onClick={loadAppointment}>Try again</button></div></main>;
  if (!appointment) return null;

  const patient = appointment.student;
  const name = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") : "Patient record unavailable";
  const patientIdentifier = patient?.employeeId || patient?.studentId;
  const canViewEmr = ["nurse", "supervisor", "physician", "dentist"].includes(normalizeRole(user?.role));
  const decision = appointment.decisionStatus || "pending";
  const decisionIsOpen = decision === "pending" && appointment.status === "scheduled";
  const checkInIsOpen = decision === "accepted" && appointment.status === "scheduled" && (appointment.dateKey === todayInManila() || appointment.noShowExempt === true);
  const usesProvider = ["Medical Consultation", "Dental Consultation"].includes(appointment.serviceType);

  async function updateProvider(providerId) {
    setProviderBusy(true);
    setError("");
    setDecisionNotice("");
    try {
      const { appointment: updated } = await assignAppointmentProvider(appointment._id, providerId || null);
      setAppointment(updated);
      const { providerSchedule: schedule } = await getAppointment(appointment._id);
      setProviderSchedule(schedule);
      setDecisionNotice(providerId ? "Provider assignment saved." : "Provider assignment cleared.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update the provider assignment.");
    } finally {
      setProviderBusy(false);
    }
  }

  async function toggleNoShowException() {
    const exempt = !appointment.noShowExempt;
    const reason = exempt ? await appDialog.prompt("Reason for allowing a late check-in:", "", "Late check-in exception", true) : "";
    if (exempt && !reason?.trim()) return;
    if (!exempt && !await appDialog.confirm("Remove this no-show exception? The appointment may be marked no-show after the configured grace period.")) return;
    setError("");
    try {
      const { appointment: updated } = await updateAppointmentNoShowException(appointment._id, exempt, reason || "");
      setAppointment(updated);
      setDecisionNotice(exempt ? "Late check-in exception recorded." : "Late check-in exception removed.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update the no-show exception.");
    }
  }

  async function retryEmail(notificationId) {
    setRetryingNotificationId(notificationId);
    setNotificationsError("");
    try {
      await retryAppointmentEmail(appointment._id, notificationId);
      await loadNotifications();
    } catch (requestError) {
      if (requestError.response?.data?.notification) {
        setNotifications((current) => current.map((item) => item._id === notificationId ? requestError.response.data.notification : item));
      }
      setNotificationsError(requestError.response?.data?.message || "Could not retry this email.");
      await loadNotifications();
    } finally {
      setRetryingNotificationId("");
    }
  }

  async function markAsArrived() {
    setCheckInBusy(true);
    setCheckInNotice("");
    setError("");
    try {
      const result = await checkInAppointment(appointment._id);
      setAppointment(result.appointment);
      setEncounter(null);
      setCheckInNotice(result.alreadyCheckedIn ? "This appointment was already checked in. Its queue entry is shown below." : "Patient checked in and added to the live queue.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not check in this appointment.");
      if (requestError.response?.status === 409) getAppointment(appointment._id).then(({ appointment: latest }) => setAppointment(latest)).catch(() => {});
    } finally {
      setCheckInBusy(false);
    }
  }

  async function decide(decisionStatus) {
    if (decisionStatus === "rejected" && !await appDialog.confirm("Reject this appointment? Its time slot will become available again.")) return;
    setDecisionBusy(true);
    setDecisionNotice("");
    setError("");
    try {
      const result = await updateAppointmentDecision(appointment._id, decisionStatus);
      setAppointment(result.appointment);
      await loadNotifications();
      setDecisionNotice(result.notificationSent
        ? `Decision saved as ${decisionStatus}. The notification was sent to ${appointment.notificationEmail || patient?.email || "the patient's saved email"}.`
        : `Decision saved as ${decisionStatus}. ${result.notificationMessage || "The notification could not be sent."}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save the appointment decision.");
      if (requestError.response?.status === 409) getAppointment(appointment._id).then(({ appointment: latest }) => setAppointment(latest)).catch(() => {});
    } finally {
      setDecisionBusy(false);
    }
  }

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
              <LabelValue label="Assigned provider">{valueOrDash(appointment.assignedProvider?.name)}</LabelValue>
              <LabelValue label="Booking status"><Status value={appointment.status} group="booking" /></LabelValue>
              <LabelValue label="Attendance status">{attendanceStatus(appointment)}</LabelValue>
              <LabelValue label="Encounter status">{appointment.queueEntry?.encounterStatusLabel || "Not checked in"}</LabelValue>
              <LabelValue label="Decision"><Status value={decision} group="decision" /></LabelValue>
              <LabelValue label="Decision recorded">{displayTimestamp(appointment.decisionAt)}</LabelValue>
              <LabelValue label="Created">{displayTimestamp(appointment.createdAt)}</LabelValue>
              <LabelValue label="Last updated">{displayTimestamp(appointment.updatedAt)}</LabelValue>
              {appointment.noShowAt && <LabelValue label="No-show recorded">{displayTimestamp(appointment.noShowAt)}</LabelValue>}
            </dl>
          </section>

          {!!appointment.statusHistory?.length && <section className="appointment-detail-card" aria-labelledby="appointment-status-history-title">
            <h2 id="appointment-status-history-title">Status History</h2>
            <ol className="appointment-status-history">{appointment.statusHistory.map((event, index) => <li key={`${event.at || index}-${index}`}><strong>{event.from === event.to ? `Exception recorded · ${event.to.replaceAll("_", " ")}` : `${event.from.replaceAll("_", " ")} → ${event.to.replaceAll("_", " ")}`}</strong><span>{displayTimestamp(event.at)} · {event.actor === "system" ? "System" : "Authorized staff"}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol>
          </section>}

          {usesProvider && <section className="appointment-detail-card" aria-labelledby="appointment-provider-title">
            <h2 id="appointment-provider-title">Provider Assignment &amp; Schedule</h2>
            <dl className="appointment-detail-grid">
              <LabelValue label="Provider">{valueOrDash(appointment.assignedProvider?.name || "Unassigned")}</LabelValue>
              <LabelValue label="Role">{valueOrDash(appointment.assignedProvider?.role)}</LabelValue>
              <LabelValue label="Scheduled duty days">{providerSchedule?.weekdays?.length ? providerSchedule.weekdays.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ") : "Unavailable"}</LabelValue>
              <LabelValue label="Duty hours">{providerSchedule ? `${providerSchedule.startTime}–${providerSchedule.endTime}` : "Unavailable"}</LabelValue>
            </dl>
            {canAssignProvider && decision === "accepted" && appointment.status === "scheduled" && <div className="appointment-provider-editor">
              {providerConfigured ? <label htmlFor="appointment-provider-select">Change provider<select id="appointment-provider-select" className="text-input" disabled={providerBusy} value={appointment.assignedProvider?._id || ""} onChange={(event) => updateProvider(event.target.value)}><option value="">Unassigned</option>{providerOptions.map((provider) => <option key={provider._id} value={provider._id}>{provider.name} · {provider.role}</option>)}</select></label> : <p className="appointment-detail-muted">No provider schedule is configured for this service. Existing kiosk weekday rules remain active until schedules are added.</p>}
              {normalizeRole(user?.role) === "supervisor" && <Link className="btn btn-outline btn-sm" to="/appointment-schedules">Manage provider schedules</Link>}
              {providerConfigured && !providerOptions.length && <p className="appointment-detail-muted">No eligible provider is free for this appointment slot.</p>}
            </div>}
          </section>}

          <section className="appointment-detail-card" aria-labelledby="appointment-attendance-title">
            <h2 id="appointment-attendance-title">Check-in and Queue</h2>
            {appointment.queueEntry && ["checked_in", "completed"].includes(appointment.status) ? <dl className="appointment-detail-grid">
              <LabelValue label="Attendance">{appointment.status === "completed" ? "Completed" : "Checked in"}</LabelValue>
              <LabelValue label="Checked in at">{displayTimestamp(appointment.checkedInAt)}</LabelValue>
              <LabelValue label="Recorded by">{valueOrDash(appointment.checkedInBy?.name)}</LabelValue>
              <LabelValue label="Queue number">{valueOrDash(appointment.queueEntry?.queueNumber)}</LabelValue>
              <LabelValue label="Queue status">{valueOrDash(appointment.queueEntry?.status?.replaceAll("_", " "))}</LabelValue>
              {appointment.queueEntry?.completedAt && <LabelValue label="Completed at">{displayTimestamp(appointment.queueEntry.completedAt)}</LabelValue>}
              <LabelValue label="Clinical encounter">{encounter ? `${encounter.visitType} · ${displayTimestamp(encounter.visitDate)}` : appointment.status === "completed" ? "No encounter record linked" : "Created when the clinical queue session is completed"}</LabelValue>
            </dl> : <p className="appointment-detail-muted">{appointment.status === "checked_in" ? "This appointment is checked in, but its linked queue entry is unavailable. Contact a supervisor." : appointment.status === "completed" ? "This appointment is completed." : appointment.status === "cancelled" ? "This appointment is cancelled." : decision !== "accepted" ? "Check-in is available after the appointment is accepted." : appointment.dateKey !== todayInManila() ? "Check-in becomes available on the appointment date." : "The patient has not arrived yet."}</p>}
            {appointment.status === "checked_in" && appointment.queueEntry?._id && <Link className="btn btn-outline btn-sm" to="/dashboard">Open live queue</Link>}
          </section>

          <section className="appointment-detail-card" aria-labelledby="appointment-email-title">
            <div className="appointment-email-heading"><h2 id="appointment-email-title">Email Notifications</h2><button className="btn btn-outline btn-sm" type="button" onClick={loadNotifications} disabled={notificationsLoading}>{notificationsLoading ? "Refreshing…" : "Refresh"}</button></div>
            {notificationsError && <p className="appointments-error" role="alert">{notificationsError}</p>}
            {notificationsLoading ? <p className="appointment-detail-muted" role="status">Loading email history…</p> : notifications.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Email</th><th>Recipient</th><th>Attempted</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>{notifications.map((notification) => <tr key={notification._id}><td><strong>{notificationTypeLabel(notification.type)}</strong><span className="appointment-cell-secondary">{notification.subject}</span></td><td>{valueOrDash(notification.recipient)}</td><td>{displayTimestamp(notification.attemptedAt || notification.queuedAt)}</td><td><Status value={notification.status} group="email" />{notification.failureReason && <span className="appointment-cell-secondary" title={notification.failureReason}>{notification.failureReason}</span>}</td><td>{notification.attempts || 0}</td><td>{notification.status === "failed" && notification.attempts < 4 && canAssignProvider ? <button className="btn btn-outline btn-sm" type="button" disabled={retryingNotificationId === notification._id} onClick={() => retryEmail(notification._id)}>{retryingNotificationId === notification._id ? "Retrying…" : "Retry"}</button> : "—"}</td></tr>)}</tbody></table></div> : <p className="appointment-detail-muted">No appointment emails have been recorded yet. Email history is available for notifications sent after this feature is deployed.</p>}
            <p className="appointment-detail-muted">“Sent” means the email provider accepted the message. Delivery confirmation is not available from the configured email flow.</p>
          </section>
        </div>
        <aside className="appointment-detail-aside" aria-label="Appointment actions">
          <section className="appointment-detail-card">
            <h2>Actions</h2>
            {decisionIsOpen ? <>
              <p className="appointment-detail-muted">Choose a decision for this request. Once saved, it cannot be changed.</p>
              <button type="button" className="btn btn-primary appointment-detail-action" disabled={decisionBusy} onClick={() => decide("accepted")}>{decisionBusy ? "Saving…" : "Accept appointment"}</button>
              <button type="button" className="btn btn-danger appointment-detail-action" disabled={decisionBusy} onClick={() => decide("rejected")}>Reject appointment</button>
            </> : decision !== "pending" ? <p className="appointment-detail-locked" role="status">Decision locked: {decision[0].toUpperCase() + decision.slice(1)}{appointment.decisionAt ? ` on ${displayTimestamp(appointment.decisionAt)}` : ""}. This decision cannot be changed.</p> : <p className="appointment-detail-muted" role="status">A decision is unavailable because this appointment is {appointment.status.replaceAll("_", " ")}.</p>}
            {decisionNotice && <p className="appointments-notice" role="status">{decisionNotice}</p>}
            {checkInIsOpen && <button type="button" className="btn btn-primary appointment-detail-action" disabled={checkInBusy} onClick={markAsArrived}>{checkInBusy ? "Checking in…" : "Mark as Arrived"}</button>}
            {["nurse", "supervisor"].includes(normalizeRole(user?.role)) && appointment.status === "scheduled" && decision === "accepted" && <button type="button" className="btn btn-outline appointment-detail-action" onClick={toggleNoShowException}>{appointment.noShowExempt ? "Remove Late Check-in Exception" : "Allow Late Check-in"}</button>}
            {appointment.noShowExempt && <p className="appointment-detail-muted">Late check-in exception: {appointment.noShowExemptionReason || "Authorized by clinic staff"}</p>}
            {appointment.status === "checked_in" && appointment.queueEntry?.queueNumber && <Link className="btn btn-primary appointment-detail-action" to="/dashboard">Queue {appointment.queueEntry.queueNumber} · Open queue</Link>}
            {checkInNotice && <p className="appointments-notice" role="status">{checkInNotice}</p>}
            {error && <p className="appointments-error" role="alert">{error}</p>}
            {canViewEmr && patient?.studentId && <Link className="btn btn-outline appointment-detail-action" to={`/emr?studentId=${encodeURIComponent(patient.studentId)}`}>Open Patient EMR</Link>}
            <Link className="btn btn-outline appointment-detail-action" to="/appointments">Return to Appointments</Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
