function formatDate(dateKey) {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString([], { dateStyle: "medium" });
}

function labelForStatus(status) {
  return ({ scheduled: "Scheduled", checked_in: "Checked in", cancelled: "Cancelled", completed: "Completed" })[status] || "Unknown";
}

function Badge({ value, kind }) {
  return <span className={`appointment-badge appointment-badge--${kind}`}>{value}</span>;
}

export default function AppointmentTable({ appointments, loading, busyId, onDecision }) {
  if (loading) return <div className="table-empty" role="status">Loading appointments…</div>;
  if (!appointments.length) return <div className="table-empty">No appointments match these filters.</div>;

  return (
    <div className="table-wrap appointment-table-wrap">
      <table className="data-table appointment-table">
        <thead><tr><th>Record ID</th><th>Date &amp; time</th><th>Patient</th><th>Service / purpose</th><th>Appointment status</th><th>Decision</th><th>Actions</th></tr></thead>
        <tbody>
          {appointments.map((appointment) => {
            const person = appointment.student;
            const decision = appointment.decisionStatus || "pending";
            const patientId = person?.employeeId || person?.studentId;
            const name = person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "Patient record unavailable";
            const pending = decision === "pending" && appointment.status === "scheduled";
            return (
              <tr key={appointment._id}>
                <td><span className="appointment-record-id" title="Database appointment ID">{appointment._id || "—"}</span></td>
                <td><strong>{formatDate(appointment.dateKey)}</strong><span className="appointment-cell-secondary">{appointment.timeSlot || "Time unavailable"}</span></td>
                <td><strong>{name}</strong><span className="appointment-cell-secondary">{patientId || "ID unavailable"}</span></td>
                <td><strong>{appointment.serviceType}</strong><span className="appointment-cell-secondary">{appointment.purpose || "No purpose specified"}</span></td>
                <td><Badge value={labelForStatus(appointment.status)} kind={appointment.status || "unknown"} /></td>
                <td><Badge value={decision[0].toUpperCase() + decision.slice(1)} kind={`decision-${decision}`} /></td>
                <td>
                  {pending ? <div className="appointment-row-actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busyId === appointment._id} onClick={() => onDecision(appointment, "accepted")}>
                      {busyId === appointment._id ? "Saving…" : "Accept"}
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" disabled={busyId === appointment._id} onClick={() => onDecision(appointment, "rejected")}>Reject</button>
                  </div> : <span className="appointment-no-action">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
