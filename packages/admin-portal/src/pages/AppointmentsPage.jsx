import { useCallback, useEffect, useState } from "react";
import { getAppointments } from "../services/api.js";
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
    return () => {
      socket.off("appointment:new", refresh);
      socket.disconnect();
    };
  }, [refresh]);

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
        <p className="page-subtitle">Upcoming appointments booked through the kiosk.</p>
        <button className="btn btn-outline" onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="page-subtitle">Loading appointments...</p>}

      {!loading && !error && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Time</th><th>Student</th><th>Student ID</th><th>Service</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment._id}>
                  <td>{formatDate(appointment.dateKey)}</td>
                  <td>{appointment.timeSlot}</td>
                  <td>{appointment.student ? `${appointment.student.firstName} ${appointment.student.lastName}` : "—"}</td>
                  <td>{appointment.student?.studentId || "—"}</td>
                  <td>{appointment.serviceType}</td>
                  <td>{appointment.purpose || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {appointments.length === 0 && <div className="table-empty">No upcoming appointments.</div>}
        </div>
      )}
    </div>
  );
}
