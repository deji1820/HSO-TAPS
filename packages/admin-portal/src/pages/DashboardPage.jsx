import { useEffect, useMemo, useState } from "react";
import { getQueue, updateQueueStatus } from "../services/api.js";
import { socket } from "../services/socket.js";
import ActiveSessionModal from "../components/ActiveSessionModal.jsx";
import { filterQueueEntries } from "../utils/queueFilters.js";
import "../styles/pages/Dashboard.css";

const PRIORITY_BADGE = {
  "High Priority": "badge-high",
  "Standard Priority": "badge-standard",
  "Routine Check": "badge-routine",
};

const SERVICE_TYPES = [
  "Medical Consultation",
  "Dental Consultation",
  "Medical Clearance",
  "Prescription/OTC Pickup",
  "General Inquiry",
  "Quick Health Screening",
];

function formatTime(dateLike) {
  if (!dateLike) return "—";
  return new Date(dateLike).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const [queue, setQueue] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [serviceFilter, setServiceFilter] = useState("All");
  const [completedToday, setCompletedToday] = useState(0);
  const [sessionEntry, setSessionEntry] = useState(null);

  useEffect(() => {
    getQueue().then((data) => {
      setQueue(data);
      if (data.length > 0) setSelectedId(data[0]._id);
    });

    socket.connect();
    socket.on("queue:new", (entry) => {
      setQueue((current) => current.some((item) => item._id === entry._id) ? current : [...current, entry]);
      setSelectedId((current) => current || entry._id);
      // Socket events carry the new queue row; reload to hydrate its student reference.
      getQueue().then(setQueue).catch((error) => console.warn("Could not refresh the live queue:", error));
    });
    socket.on("queue:update", (updated) => {
      if (updated.status === "completed" || updated.status === "cancelled") {
        setQueue((q) => q.filter((e) => e._id !== updated._id));
        if (updated.status === "completed") setCompletedToday((c) => c + 1);
      } else {
        setQueue((q) => q.map((e) => (e._id === updated._id ? updated : e)));
      }
    });

    return () => {
      socket.off("queue:new");
      socket.off("queue:update");
      socket.disconnect();
    };
  }, []);

  const highPriorityCount = queue.filter((q) => q.priorityLevel === "High Priority").length;

  const visibleQueue = useMemo(
    () => filterQueueEntries(queue, { serviceFilter, priorityFilter }),
    [queue, priorityFilter, serviceFilter]
  );

  const selected = queue.find((e) => e._id === selectedId) || null;

  async function handleStatusChange(id, status) {
    const updated = await updateQueueStatus(id, status);
    if (status === "completed" || status === "cancelled") {
      setQueue((q) => q.filter((e) => e._id !== id));
      if (status === "completed") setCompletedToday((c) => c + 1);
    } else {
      setQueue((q) => q.map((e) => (e._id === id ? updated : e)));
    }
  }

  return (
    <div>
      <div className="page-header">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <h1>Dashboard</h1>
          <div className="page-subtitle">Welcome back, Admin!</div>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">⏳ Active Queue</div>
          <div className="stat-value">{queue.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🌡️ High Priority</div>
          <div className="stat-value">{highPriorityCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">✅ Completed Today</div>
          <div className="stat-value">{completedToday}</div>
        </div>
      </div>

      <div className="announcement-banner">
        <span>📣 <strong>Announcement:</strong> Health Services Office announcements will appear here…</span>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="queue-list-header">
            <h2>Live Dynamic Queue List</h2>
            <div className="queue-filters">
              <select className="text-input filter-select" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Filter by service">
                <option value="All">All services</option>
                {SERVICE_TYPES.map((service) => <option value={service} key={service}>{service}</option>)}
              </select>
              <select className="text-input filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Filter by priority">
                <option value="All">All priorities</option>
                <option value="High Priority">High Priority</option>
                <option value="Standard Priority">Standard Priority</option>
                <option value="Routine Check">Routine Check</option>
              </select>
            </div>
          </div>

          {visibleQueue.length === 0 ? (
            <div className="table-empty">No one in the queue right now.</div>
          ) : (
            <ul className="queue-list">
              {visibleQueue.map((entry) => (
                <li
                  key={entry._id}
                  className={"queue-row" + (entry._id === selectedId ? " selected" : "")}
                  onClick={() => setSelectedId(entry._id)}
                >
                  <div className="queue-row-top">
                    <span className={"badge " + PRIORITY_BADGE[entry.priorityLevel]}>{entry.priorityLevel}</span>
                    <span className="queue-number">{entry.queueNumber || "----"}</span>
                  </div>
                  <div className="queue-row-body">
                    <div>
                      <div className="queue-name">{entry.student?.firstName} {entry.student?.lastName}</div>
                      <div className="queue-meta">Student ID: {entry.student?.studentId}</div>
                      <div className="queue-service">{entry.serviceType || "Service unavailable"}</div>
                    </div>
                    <div className="queue-reason-time">
                      <div className="queue-meta">Reason: {entry.reason}</div>
                      <div className="queue-meta">Time: {formatTime(entry.createdAt)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card patient-snapshot">
          <h2>Patient Snapshot</h2>
          {!selected ? (
            <div className="table-empty">Select someone from the queue to see details.</div>
          ) : (
            <>
              <div className="snapshot-row">
                <span className={"badge " + PRIORITY_BADGE[selected.priorityLevel]}>{selected.priorityLevel}</span>
                <span className="queue-number">{selected.queueNumber || "----"}</span>
              </div>
              <div className="snapshot-field"><span>Name:</span> {selected.student?.firstName} {selected.student?.lastName}</div>
              <div className="snapshot-field"><span>Student ID:</span> {selected.student?.studentId}</div>
              <div className="snapshot-field"><span>Program:</span> {selected.student?.program || "—"}</div>
              <div className="snapshot-field"><span>Service:</span> {selected.serviceType || "—"}</div>

              {selected.requestDetails && (
                <div className="snapshot-field"><span>Details:</span> "{selected.requestDetails}"</div>
              )}

              <div className="snapshot-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => handleStatusChange(selected._id, "called")}
                  disabled={selected.status !== "waiting"}
                >
                  Call to Desk
                </button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    if (selected.status !== "in_session") {
                      await handleStatusChange(selected._id, "in_session");
                    }
                    setSessionEntry(selected);
                  }}
                >
                  {selected.status === "in_session" ? "Resume Session" : "Start"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {sessionEntry && (
        <ActiveSessionModal
          entry={sessionEntry}
          onClose={() => setSessionEntry(null)}
          onCompleted={(updatedEntry) => {
            setQueue((q) => q.filter((e) => e._id !== updatedEntry._id));
            setCompletedToday((c) => c + 1);
            setSessionEntry(null);
          }}
        />
      )}
    </div>
  );
}
