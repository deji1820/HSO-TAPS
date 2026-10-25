import { useCallback, useEffect, useRef, useState } from "react";
import { getAppointments, updateAppointmentDecision } from "../services/api.js";
import { socket } from "../services/socket.js";
import AppointmentFilters from "../components/AppointmentFilters.jsx";
import AppointmentTable from "../components/AppointmentTable.jsx";
import { Link } from "react-router-dom";
import { normalizeRole } from "../utils/roles.js";
import "../styles/pages/Appointments.css";

const INITIAL_FILTERS = { from: "", to: "", serviceType: "", decisionStatus: "", status: "" };

export default function AppointmentsPage({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const refresh = useCallback(() => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    const query = { ...filters, search: debouncedSearch, page };
    return getAppointments(query)
      .then((result) => {
        if (requestId !== requestSequence.current) return;
        const pageCount = Math.max(1, Math.ceil(result.total / result.limit));
        if (page > pageCount) { setPage(pageCount); return; }
        setAppointments(result.items);
        setTotal(result.total);
        setLimit(result.limit);
        setLastUpdated(new Date());
      })
      .catch((requestError) => {
        if (requestId === requestSequence.current) setError(requestError.response?.data?.message || "Could not load appointments. Check the server connection and try again.");
      })
      .finally(() => { if (requestId === requestSequence.current) setLoading(false); });
  }, [filters, debouncedSearch, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    const refreshCurrentView = () => refreshRef.current();
    socket.connect();
    socket.on("appointment:new", refreshCurrentView);
    socket.on("appointment:update", refreshCurrentView);
    return () => {
      socket.off("appointment:new", refreshCurrentView);
      socket.off("appointment:update", refreshCurrentView);
      socket.disconnect();
    };
  }, []);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setFilters(INITIAL_FILTERS);
    setPage(1);
  }

  async function decide(appointment, decisionStatus) {
    if (decisionStatus === "rejected" && !window.confirm("Reject this appointment? Its time slot will become available again.")) return;
    setBusyId(appointment._id);
    setError("");
    setNotice("");
    try {
      const result = await updateAppointmentDecision(appointment._id, decisionStatus);
      const recipient = appointment.notificationEmail || appointment.student?.email || "the student's saved email";
      setNotice(result.notificationSent
        ? `Appointment ${decisionStatus}. The email was sent to ${recipient}.`
        : `Appointment ${decisionStatus}. ${result.notificationMessage || "The email could not be sent."}`);
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update this appointment.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="appointments-page">
      <header className="appointments-heading">
        <div className="page-header">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
          <h1>Appointments</h1>
        </div>
        <p className="page-subtitle">Review and manage kiosk appointment requests.</p>
        {normalizeRole(user?.role) === "supervisor" && <Link to="/appointment-schedules" className="btn btn-outline">Manage provider schedules</Link>}
      </header>

      <div className="appointments-toolbar">
        <p className="appointments-result-count" aria-live="polite">{loading ? "Updating appointments…" : `${total} appointment${total === 1 ? "" : "s"} found`}{!filters.from && !filters.to ? " · From today onward" : ""}{lastUpdated && !loading ? ` · Updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</p>
        <button type="button" className="btn btn-outline" onClick={refresh} disabled={loading}>Refresh</button>
      </div>

      <AppointmentFilters search={search} filters={filters} onSearchChange={(value) => { setSearch(value); setPage(1); }} onFilterChange={updateFilter} onClear={clearFilters} />
      {notice && <p role="status" className="appointments-notice">{notice}</p>}
      {error && <div className="appointments-error" role="alert"><span>{error}</span><button type="button" className="btn btn-outline btn-sm" onClick={refresh} disabled={loading}>Try again</button></div>}
      {!error && <AppointmentTable appointments={appointments} loading={loading} busyId={busyId} onDecision={decide} />}
      {!error && total > limit && <nav className="appointment-pagination" aria-label="Appointment pages">
        <span>Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}</span>
        <div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1}>Previous</button>
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((current) => Math.min(Math.ceil(total / limit), current + 1))} disabled={loading || page >= Math.ceil(total / limit)}>Next</button>
        </div>
      </nav>}
    </main>
  );
}
