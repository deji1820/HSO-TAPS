export default function AppointmentFilters({ search, filters, onSearchChange, onFilterChange, onClear }) {
  const hasFilters = Boolean(search || filters.from || filters.to || filters.serviceType || filters.decisionStatus || filters.status);

  return (
    <section className="appointment-filters" aria-label="Filter appointments">
      <label className="appointment-filter-search">
        Search appointments
        <input className="text-input" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} maxLength={100} placeholder="Name, student or employee ID, email, appointment ID" />
      </label>
      <label>From<input className="text-input" type="date" value={filters.from} onChange={(event) => onFilterChange("from", event.target.value)} /></label>
      <label>To<input className="text-input" type="date" value={filters.to} onChange={(event) => onFilterChange("to", event.target.value)} /></label>
      <label>Service
        <select className="text-input" value={filters.serviceType} onChange={(event) => onFilterChange("serviceType", event.target.value)}>
          <option value="">All services</option><option>Medical Consultation</option><option>Dental Consultation</option><option>Medical Clearance</option><option>Prescription &amp; Medicine Request</option>
        </select>
      </label>
      <label>Decision
        <select className="text-input" value={filters.decisionStatus} onChange={(event) => onFilterChange("decisionStatus", event.target.value)}>
          <option value="">All decisions</option><option value="pending">Pending review</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option>
        </select>
      </label>
      <label>Appointment status
        <select className="text-input" value={filters.status} onChange={(event) => onFilterChange("status", event.target.value)}>
          <option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="checked_in">Checked in</option><option value="no_show">No-show</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option>
        </select>
      </label>
      <button type="button" className="btn btn-outline appointment-filter-clear" onClick={onClear} disabled={!hasFilters}>Clear filters</button>
    </section>
  );
}
