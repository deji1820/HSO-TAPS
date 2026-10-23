import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQueue, getQueueHistory, updateQueueStatus, getAnnouncement, saveAnnouncement } from "../services/api.js";
import { socket } from "../services/socket.js";
import ActiveSessionModal from "../components/ActiveSessionModal.jsx";
import NursingAssessmentModal from "../components/NursingAssessmentModal.jsx";
import "../styles/pages/Dashboard.css";

const SERVICE_TYPES = ["Medical Consultation", "Dental Consultation", "Medical Clearance", "Prescription/OTC Pickup", "General Inquiry", "Quick Health Screening"];
const BADGE = { "High Priority": "badge-high", "Standard Priority": "badge-standard", "Routine Check": "badge-routine" };
const clock = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
const dateTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const STATUS_LABEL = { waiting: "Waiting", called: "Called to desk", in_session: "Nursing assessment", awaiting_provider: "Waiting for provider", provider_in_session: "With provider", completed: "Completed", cancelled: "Cancelled" };
const HISTORY_STATUS_LABEL = { ...STATUS_LABEL, waiting: "Not called" };

function filterQueueEntries(entries, { provider, filter, search }) {
  return entries.filter((entry) => {
    if (provider && !["Medical Consultation", "Dental Consultation", "Medical Clearance"].includes(entry.serviceType)) return false;
    const matchesFilter = filter === "All" || (filter === "High Priority" ? entry.priorityLevel === filter : entry.serviceType === filter);
    const name = `${entry.student?.firstName || ""} ${entry.student?.lastName || ""} ${entry.student?.studentId || ""} ${entry.queueNumber || ""}`.toLowerCase();
    return matchesFilter && name.includes(search.toLowerCase());
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyError, setHistoryError] = useState("");
  const [queueView, setQueueView] = useState("active");
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sessionEntry, setSessionEntry] = useState(null);
  const [nursingEntry, setNursingEntry] = useState(null);
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const provider = ["physician", "doctor", "dentist"].includes(user.role);
  const supervisor = user.role === "supervisor";
  const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(user.role);
  const [announcement, setAnnouncement] = useState("Health Services Office announcements will appear here.");
  const [sortOrder, setSortOrder] = useState("asc");

  const refreshQueue = useCallback(() => {
    getQueue().then(setQueue).catch((error) => console.warn("Could not refresh the live queue:", error));
  }, []);

  const refreshHistory = useCallback(() => {
    getQueueHistory({ from: historyFrom, to: historyTo, page: historyPage }).then((result) => {
      setHistory(result.entries || []);
      setHistoryTotal(result.total || 0);
      setHistoryTotalPages(result.totalPages || 1);
      setHistoryError("");
    }).catch((error) => {
      setHistory([]);
      setHistoryTotal(0);
      setHistoryTotalPages(1);
      setHistoryError(error.response?.data?.message || "Could not load queue history.");
    });
  }, [historyFrom, historyTo, historyPage]);

  useEffect(() => {
    refreshQueue();
    refreshHistory();
    getAnnouncement().then((value) => setAnnouncement(value.text)).catch(() => {});
    socket.connect();
    const onNew = (entry) => {
      refreshQueue();
      setSelectedId((current) => current || entry._id);
    };
    const onUpdate = (entry) => {
      refreshQueue();
      refreshHistory();
      if (["completed", "cancelled"].includes(entry.status)) setSelectedId((current) => current === entry._id ? null : current);
    };
    socket.on("queue:new", onNew);
    socket.on("queue:update", onUpdate);
    const onAnnouncement = (value) => setAnnouncement(value.text);
    socket.on("announcement:update", onAnnouncement);
    return () => { socket.off("queue:new", onNew); socket.off("queue:update", onUpdate); socket.off("announcement:update", onAnnouncement); socket.disconnect(); };
  }, [refreshQueue, refreshHistory]);

  const visibleQueue = useMemo(() => filterQueueEntries(queue, { provider, filter, search }).sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)) * (sortOrder === "asc" ? 1 : -1)), [queue, filter, search, provider, sortOrder]);
  const visibleHistory = useMemo(() => filterQueueEntries(history, { provider, filter, search }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [history, filter, search, provider]);
  const selected = (queueView === "active" ? queue : history).find((entry) => entry._id === selectedId) || null;

  async function changeStatus(id, status) {
    if (status === "cancelled" && !window.confirm("Cancel this queue entry?")) return;
    const updated = await updateQueueStatus(id, status);
    if (["completed", "cancelled"].includes(status)) {
      setQueue((items) => items.filter((item) => item._id !== id));
      refreshHistory();
    } else {
      setQueue((items) => items.map((item) => item._id === id ? updated : item));
      setSelectedId(id);
    }
    return updated;
  }

  return <div className="nurse-dashboard">
    <p className="nurse-greeting">Good morning, {user.name || (provider ? "Clinician" : "Nurse")}!</p>
    <div className="page-header nurse-dashboard-heading">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v5h-8zm0 7h8v11h-8zM3 13h8v8H3z" /></svg>
      <h1>{provider ? "Patient Queue" : "Dashboard"}</h1>
      <label className="dashboard-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." aria-label="Search queue" /></label>
    </div>
    <section className="announcement-banner"><div><strong>📣 Announcement:</strong><p>{announcement}</p></div>{supervisor && <button type="button" className="announcement-edit" onClick={async () => { const next = window.prompt("Announcement text", announcement); if (next?.trim()) { try { const saved = await saveAnnouncement(next.trim()); setAnnouncement(saved.text); } catch { window.alert("Could not save the announcement to the server."); } } }}>Edit Banner</button>}</section>
    {["nurse", "supervisor"].includes(user.role) && <div className="dashboard-create-row"><button className="btn btn-success" onClick={() => navigate("/new-record")}>＋ New Medical Record</button></div>}

    <div className="dashboard-grid">
      <section className="card dashboard-queue-card">
        <div className="queue-view-tabs" role="tablist" aria-label="Queue views">
          <button type="button" role="tab" aria-selected={queueView === "active"} className={queueView === "active" ? "active" : ""} onClick={() => { setQueueView("active"); setSelectedId(null); }}>Active Queue ({queue.length})</button>
          <button type="button" role="tab" aria-selected={queueView === "history"} className={queueView === "history" ? "active" : ""} onClick={() => { setQueueView("history"); setSelectedId(null); }}>Queue History ({historyTotal})</button>
        </div>
        <div className="queue-list-header">
          <h2>{queueView === "active" ? "Active Queue" : "Queue History - All Dates"}</h2>
          <select className="text-input filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter queue"><option value="All">Filter by</option><option value="High Priority">High Priority</option>{(provider ? SERVICE_TYPES.slice(0, 3) : SERVICE_TYPES).map((service) => <option key={service}>{service}</option>)}</select>
          {queueView === "active" && <select className="text-input filter-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort by time-in"><option value="asc">Time-in: Oldest first</option><option value="desc">Time-in: Newest first</option></select>}
        </div>
        {queueView === "history" && <div className="queue-history-controls">
          <label>From<input type="date" value={historyFrom} max={historyTo || undefined} onChange={(event) => { setHistoryFrom(event.target.value); setHistoryPage(1); setSelectedId(null); }} /></label>
          <label>To<input type="date" value={historyTo} min={historyFrom || undefined} onChange={(event) => { setHistoryTo(event.target.value); setHistoryPage(1); setSelectedId(null); }} /></label>
          {(historyFrom || historyTo) && <button type="button" className="btn btn-secondary" onClick={() => { setHistoryFrom(""); setHistoryTo(""); setHistoryPage(1); setSelectedId(null); }}>All dates</button>}
          <span>Showing {history.length} of {historyTotal} entries; 50 per page</span>
        </div>}
        {queueView === "history" && historyError && <div className="table-empty" role="alert">{historyError}</div>}
        {queueView === "active" ? (
          visibleQueue.length ? <div className="table-wrap dashboard-queue-table-wrap"><table className="data-table dashboard-queue-table"><thead><tr><th>Queue Number</th><th>Patient Name</th><th>Time-in</th><th>Purpose</th><th>Status</th></tr></thead><tbody>{visibleQueue.map((entry) => <tr key={entry._id} className={entry._id === selectedId ? "selected" : ""} onClick={() => setSelectedId(entry._id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelectedId(entry._id)}><td><span className="queue-number">{entry.queueNumber || "—"}</span></td><td>{entry.student?.firstName} {entry.student?.lastName}</td><td>{clock(entry.createdAt)}</td><td>{entry.serviceType || "—"}</td><td>{STATUS_LABEL[entry.status] || entry.status}</td></tr>)}</tbody></table></div> : <div className="table-empty">No active patients in the queue.</div>
        ) : (
          visibleHistory.length ? <div className="table-wrap dashboard-queue-table-wrap"><table className="data-table dashboard-queue-table"><thead><tr><th>Queue Number</th><th>Patient Name</th><th>Date / time queued</th><th>Called at</th><th>Purpose</th><th>Status</th></tr></thead><tbody>{visibleHistory.map((entry) => <tr key={entry._id} className={entry._id === selectedId ? "selected" : ""} onClick={() => setSelectedId(entry._id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelectedId(entry._id)}><td><span className="queue-number">{entry.queueNumber || "-"}</span></td><td>{entry.student?.firstName} {entry.student?.lastName}</td><td>{dateTime(entry.createdAt)}</td><td>{entry.calledAt ? dateTime(entry.calledAt) : "-"}</td><td>{entry.serviceType || "-"}</td><td>{HISTORY_STATUS_LABEL[entry.status] || entry.status}</td></tr>)}</tbody></table></div> : !historyError && <div className="table-empty">No archived queue entries match this date range.</div>
        )}
        {queueView === "history" && <nav className="queue-history-pagination" aria-label="Queue history pages">
          <button type="button" className="btn btn-secondary" disabled={historyPage <= 1} onClick={() => { setHistoryPage((page) => Math.max(1, page - 1)); setSelectedId(null); }}>Previous</button>
          <span>Page {historyPage} of {historyTotalPages}</span>
          <button type="button" className="btn btn-secondary" disabled={historyPage >= historyTotalPages} onClick={() => { setHistoryPage((page) => Math.min(historyTotalPages, page + 1)); setSelectedId(null); }}>Next</button>
        </nav>}
      </section>

      <section className="card patient-snapshot"><h2>Patient Snapshot</h2>{!selected ? <div className="table-empty">Select a patient from the queue to see details.</div> : <>
        <div className="snapshot-row"><span className={"badge " + BADGE[selected.priorityLevel]}>{selected.priorityLevel}</span><strong className="queue-number">{selected.queueNumber || "—"}</strong></div>
        <div className="snapshot-field"><span>Patient Name:</span> {selected.student?.firstName} {selected.student?.lastName}</div>
        <div className="snapshot-field"><span>Patient Type:</span> Student</div>
        <div className="snapshot-field"><span>Student ID:</span> {selected.student?.studentId || "—"}</div>
        <div className="snapshot-field"><span>Department:</span> {selected.student?.program || "—"}</div>
        <div className="snapshot-field"><span>Purpose:</span> {selected.serviceType || "—"}</div>
        {queueView === "active" ? <>
          <div className="snapshot-field"><span>Status:</span> {STATUS_LABEL[selected.status] || selected.status}</div>
          <div className="snapshot-actions">
            {selected.status === "waiting" && <button className="btn btn-warning" onClick={() => changeStatus(selected._id, "called")}>Call to Desk</button>}
            {isNursingTeam(user.role) && selected.status === "called" && <button className="btn btn-success" onClick={async () => { const entry = await changeStatus(selected._id, "in_session"); if (entry) setNursingEntry(entry); }}>Start Nursing Assessment</button>}
            {isNursingTeam(user.role) && selected.status === "in_session" && <button className="btn btn-success" onClick={() => setNursingEntry(selected)}>Resume Nursing Assessment</button>}
            {provider && selected.status === "awaiting_provider" && <button className="btn btn-success" onClick={async () => { const entry = await changeStatus(selected._id, "provider_in_session"); if (entry) setSessionEntry(entry); }}>Start Provider Review</button>}
            {provider && selected.status === "provider_in_session" && <button className="btn btn-success" onClick={() => setSessionEntry(selected)}>Resume Provider Review</button>}
            {!provider && <button className="btn btn-danger" onClick={() => changeStatus(selected._id, "cancelled")}>Cancel</button>}
          </div>
          {clinicalRole && <div className="snapshot-actions"><button className="btn btn-primary" onClick={() => navigate(`/emr?studentId=${selected.student?.studentId || ""}`)}>Full EMR</button></div>}
        </> : <>
          <div className="snapshot-field"><span>Status:</span> {HISTORY_STATUS_LABEL[selected.status] || selected.status}</div>
          <div className="snapshot-field"><span>Checked in:</span> {dateTime(selected.createdAt)}</div>
          <div className="snapshot-field"><span>Called:</span> {dateTime(selected.calledAt)}</div>
          {selected.startedAt && <div className="snapshot-field"><span>Started:</span> {dateTime(selected.startedAt)}</div>}
          {selected.completedAt && <div className="snapshot-field"><span>Completed:</span> {dateTime(selected.completedAt)}</div>}
          {selected.reason && <div className="snapshot-field"><span>Reason:</span> {selected.reason}</div>}
          {selected.requestDetails && <div className="snapshot-field"><span>Request details:</span> {selected.requestDetails}</div>}
          {selected.linkedVitals && <div className="snapshot-archive-vitals"><strong>Vitals</strong><div>Temperature: {selected.linkedVitals.temperatureC ?? "—"} °C</div><div>Height: {selected.linkedVitals.heightCm ?? "—"} cm</div><div>Weight: {selected.linkedVitals.weightKg ?? "—"} kg</div><div>Blood pressure: {selected.linkedVitals.bloodPressure || "—"}</div></div>}
          <div className="snapshot-actions">
            {provider && ["awaiting_provider", "provider_in_session"].includes(selected.status) && <button className="btn btn-success" onClick={async () => { const entry = selected.status === "provider_in_session" ? selected : await changeStatus(selected._id, "provider_in_session"); if (entry) setSessionEntry(entry); }}>{selected.status === "provider_in_session" ? "Resume Provider Review" : "Start Provider Review"}</button>}
            {clinicalRole && <button className="btn btn-primary" onClick={() => navigate(`/emr?studentId=${selected.student?.studentId || ""}`)}>Full EMR</button>}
          </div>
        </>}
      </>}</section>
    </div>

    {nursingEntry && <NursingAssessmentModal entry={nursingEntry} onClose={() => setNursingEntry(null)} onSaved={(entry) => { setQueue((items) => items.map((item) => item._id === entry._id ? entry : item)); setSelectedId(entry._id); setNursingEntry(null); }} onRouted={(entry) => { setQueue((items) => items.map((item) => item._id === entry._id ? entry : item)); setSelectedId(entry._id); setNursingEntry(null); }} />}
    {sessionEntry && <ActiveSessionModal entry={sessionEntry} onClose={() => setSessionEntry(null)} onCompleted={(entry) => { setQueue((items) => items.filter((item) => item._id !== entry._id)); setSelectedId(null); setSessionEntry(null); refreshHistory(); }} />}
  </div>;
}

function isNursingTeam(role) { return ["nurse", "supervisor"].includes(role); }
