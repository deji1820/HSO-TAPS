import { useCallback, useEffect, useState } from "react";
import { getAppointments, updateAppointmentDecision } from "../services/api.js";
import { socket } from "../services/socket.js";

function formatDate(dateKey) {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], { dateStyle: "medium" });
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    return getAppointments()
      .then(setAppointments)
      .catch(() => setError("Could not load scheduled appointments. Is the server running?"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    socket.connect();
    socket.on("appointment:new", refresh);
    socket.on("appointment:update", refresh);
    return () => {
      socket.off("appointment:new", refresh);
      socket.off("appointment:update", refresh);
      socket.disconnect();
    };
  }, [refresh]);

  const decide = async (appointment, decisionStatus) => {
    if (decisionStatus === "rejected" && !window.confirm("Reject this appointment? Its time slot will become available again.")) return;
    setBusyId(appointment._id);
    setError("");
    setNotice("");
    try {
      const result = await updateAppointmentDecision(appointment._id, decisionStatus);
      setNotice(result.notificationSent
        ? "Appointment " + decisionStatus + ". The email notice was sent to " + (appointment.notificationEmail || appointment.student?.email) + "."
        : "Appointment " + decisionStatus + ". " + (result.notificationMessage || "The email could not be sent."));
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update this appointment.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div>
      <div className="page-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        <h1>Appointments</h1>
      </div>

      <div className="queue-list-header">
        <p className="page-subtitle">Review kiosk appointment requests. Decisions are emailed to the student’s school address.</p>
        <button className="btn btn-outline" onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p className="page-subtitle">Loading appointments...</p>}

      {!loading && !error && (
        <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr><th>Date</th><th>Time</th><th>Student</th><th>Student ID</th><th>School email</th><th>Service</th><th>Purpose</th><th>Decision</th><th>Action</th></tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment._id}>
                  <td>{formatDate(appointment.dateKey)}</td>
                  <td>{appointment.timeSlot}</td>
                  <td>{appointment.student ? appointment.student.firstName + " " + appointment.student.lastName : "—"}</td>
                  <td>{appointment.student?.studentId || "—"}</td>
                  <td>{appointment.student?.email || "Email missing"}</td>
                  <td>{appointment.serviceType}</td>
                  <td>{appointment.purpose || "—"}</td>
                  <td>{(appointment.decisionStatus || "pending").replace(/^./, (letter) => letter.toUpperCase())}</td>
                  <td>
                    {(appointment.decisionStatus || "pending") === "pending" && appointment.status === "scheduled" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={busyId === appointment._id} onClick={() => decide(appointment, "accepted")}>
                          {busyId === appointment._id ? "Saving..." : "Accept"}
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === appointment._id} onClick={() => decide(appointment, "rejected")}>
                          Reject
                        </button>
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {appointments.length === 0 && <div className="table-empty">No upcoming appointment requests.</div>}
        </div>
      )}
    </div>
  );
}
