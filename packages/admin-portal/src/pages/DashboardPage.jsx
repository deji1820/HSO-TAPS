import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQueue, updateQueueStatus, getAnnouncement, saveAnnouncement } from "../services/api.js";
import { socket } from "../services/socket.js";
import ActiveSessionModal from "../components/ActiveSessionModal.jsx";
import "../styles/pages/Dashboard.css";

const SERVICE_TYPES = ["Medical Consultation", "Dental Consultation", "Medical Clearance", "Prescription/OTC Pickup", "General Inquiry", "Quick Health Screening"];
const BADGE = { "High Priority": "badge-high", "Standard Priority": "badge-standard", "Routine Check": "badge-routine" };
const clock = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sessionEntry, setSessionEntry] = useState(null);
  const user = JSON.parse(localStorage.getItem("hsotap_user") || "{}");
  const provider = ["physician", "doctor", "dentist"].includes(user.role);
  const supervisor = user.role === "supervisor";
  const [announcement, setAnnouncement] = useState("Health Services Office announcements will appear here.");
  const [sortOrder, setSortOrder] = useState("asc");

  useEffect(() => {
    getQueue().then(setQueue).catch((error) => console.warn("Could not load the live queue:", error));
    getAnnouncement().then((value) => setAnnouncement(value.text)).catch(() => {});
    socket.connect();
    const onNew = (entry) => {
      getQueue().then(setQueue).catch((error) => console.warn("Could not refresh the live queue:", error));
      setSelectedId((current) => current || entry._id);
    };
    const onUpdate = (entry) => setQueue((items) => ["completed", "cancelled"].includes(entry.status) ? items.filter((item) => item._id !== entry._id) : items.map((item) => item._id === entry._id ? entry : item));
    socket.on("queue:new", onNew);
    socket.on("queue:update", onUpdate);
    const onAnnouncement = (value) => setAnnouncement(value.text);
    socket.on("announcement:update", onAnnouncement);
    return () => { socket.off("queue:new", onNew); socket.off("queue:update", onUpdate); socket.off("announcement:update", onAnnouncement); socket.disconnect(); };
  }, []);

  const visibleQueue = useMemo(() => queue.filter((entry) => {
    if (provider && !["Medical Consultation", "Dental Consultation"].includes(entry.serviceType)) return false;
    const matchesFilter = filter === "All" || (filter === "High Priority" ? entry.priorityLevel === filter : entry.serviceType === filter);
    const name = `${entry.student?.firstName || ""} ${entry.student?.lastName || ""} ${entry.student?.studentId || ""} ${entry.queueNumber || ""}`.toLowerCase();
    return matchesFilter && name.includes(search.toLowerCase());
  }).sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)) * (sortOrder === "asc" ? 1 : -1)), [queue, filter, search, provider, sortOrder]);
  const selected = queue.find((entry) => entry._id === selectedId) || null;

  async function changeStatus(id, status) {
    if (status === "cancelled" && !window.confirm("Cancel this queue entry?")) return;
    const updated = await updateQueueStatus(id, status);
    setQueue((items) => ["completed", "cancelled"].includes(status) ? items.filter((item) => item._id !== id) : items.map((item) => item._id === id ? updated : item));
  }

  return <div className="nurse-dashboard">
    <p className="nurse-greeting">Good morning, {user.name || (provider ? "Clinician" : "Nurse")}!</p>
    <div className="page-header nurse-dashboard-heading">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v5h-8zm0 7h8v11h-8zM3 13h8v8H3z" /></svg>
      <h1>{provider ? "Patient Queue" : "Dashboard"}</h1>
      <label className="dashboard-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." aria-label="Search queue" /></label>
    </div>
    <section className="announcement-banner"><div><strong>📣 Announcement:</strong><p>{announcement}</p></div>{supervisor && <button type="button" className="announcement-edit" onClick={async () => { const next = window.prompt("Announcement text", announcement); if (next?.trim()) { try { const saved = await saveAnnouncement(next.trim()); setAnnouncement(saved.text); } catch { window.alert("Could not save the announcement to the server."); } } }}>Edit Banner</button>}</section>
    {!provider && <div className="dashboard-create-row"><button className="btn btn-success" onClick={() => navigate("/new-record")}>＋ New Medical Record</button></div>}

    <div className="dashboard-grid">
      <section className="card dashboard-queue-card">
        <div className="queue-list-header"><h2>Live Dynamic Queue List</h2><select className="text-input filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter queue"><option value="All">Filter by</option><option value="High Priority">High Priority</option>{(provider ? SERVICE_TYPES.slice(0, 2) : SERVICE_TYPES).map((service) => <option key={service}>{service}</option>)}</select><select className="text-input filter-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort by time-in"><option value="asc">Time-in: Oldest first</option><option value="desc">Time-in: Newest first</option></select></div>
        {visibleQueue.length ? <div className="table-wrap dashboard-queue-table-wrap"><table className="data-table dashboard-queue-table"><thead><tr><th>Queue Number</th><th>Patient Name</th><th>Time-in</th><th>Purpose</th></tr></thead><tbody>{visibleQueue.map((entry) => <tr key={entry._id} className={entry._id === selectedId ? "selected" : ""} onClick={() => setSelectedId(entry._id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelectedId(entry._id)}><td><span className="queue-number">{entry.queueNumber || "—"}</span></td><td>{entry.student?.firstName} {entry.student?.lastName}</td><td>{clock(entry.createdAt)}</td><td>{entry.serviceType || "—"}</td></tr>)}</tbody></table></div> : <div className="table-empty">No one in the queue right now.</div>}
      </section>

      <section className="card patient-snapshot"><h2>Patient Snapshot</h2>{!selected ? <div className="table-empty">Select a patient from the queue to see details.</div> : <>
        <div className="snapshot-row"><span className={"badge " + BADGE[selected.priorityLevel]}>{selected.priorityLevel}</span><strong className="queue-number">{selected.queueNumber || "—"}</strong></div>
        <div className="snapshot-field"><span>Patient Name:</span> {selected.student?.firstName} {selected.student?.lastName}</div>
        <div className="snapshot-field"><span>Patient Type:</span> Student</div>
        <div className="snapshot-field"><span>Student ID:</span> {selected.student?.studentId || "—"}</div>
        <div className="snapshot-field"><span>Department:</span> {selected.student?.program || "—"}</div>
        <div className="snapshot-field"><span>Purpose:</span> {selected.serviceType || "—"}</div>
        <div className="snapshot-actions"><button className="btn btn-warning" disabled={selected.status !== "waiting"} onClick={() => changeStatus(selected._id, "called")}>Call to Desk</button><button className="btn btn-success" onClick={async () => { if (selected.status !== "in_session") await changeStatus(selected._id, "in_session"); setSessionEntry(selected); }}>{selected.status === "in_session" ? "Resume" : "Start"}</button></div>
        <div className="snapshot-actions"><button className="btn btn-danger" onClick={() => changeStatus(selected._id, "cancelled")}>Cancel</button><button className="btn btn-primary" onClick={() => navigate(`/emr?studentId=${selected.student?.studentId || ""}`)}>Full EMR</button></div>
      </>}</section>
    </div>

    {sessionEntry && <ActiveSessionModal entry={sessionEntry} onClose={() => setSessionEntry(null)} onCompleted={(entry) => { setQueue((items) => items.filter((item) => item._id !== entry._id)); setSessionEntry(null); }} />}
  </div>;
}
