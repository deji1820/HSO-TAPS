import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { disableProviderSchedule, getProviderOptions, getProviderSchedules, saveProviderSchedule } from "../services/api.js";
import "../styles/pages/ProviderSchedules.css";

const SERVICES = ["Medical Consultation", "Dental Consultation"];
const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"]];

function dayNames(weekdays = []) {
  return DAYS.filter(([day]) => weekdays.includes(day)).map(([, name]) => name).join(", ") || "No days selected";
}

export default function ProviderSchedulesPage() {
  const [serviceType, setServiceType] = useState(SERVICES[0]);
  const [providers, setProviders] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [providerId, setProviderId] = useState("");
  const [weekdays, setWeekdays] = useState([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [scheduleData, providerData] = await Promise.all([
        getProviderSchedules(),
        getProviderOptions({ serviceType }),
      ]);
      setSchedules(scheduleData);
      setProviders(providerData.providers || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load provider schedules.");
    } finally {
      setLoading(false);
    }
  }, [serviceType]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setProviderId("");
    setWeekdays([]);
    setStartTime("");
    setEndTime("");
    setEditingId("");
  }

  function editSchedule(schedule) {
    setServiceType(schedule.serviceType);
    setProviderId(schedule.provider?._id || "");
    setWeekdays(schedule.weekdays || []);
    setStartTime(schedule.startTime || "");
    setEndTime(schedule.endTime || "");
    setEditingId(schedule._id);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveProviderSchedule({ providerId, serviceType, weekdays, startTime, endTime });
      setNotice("Provider schedule saved. New kiosk availability and appointment assignments will use these hours.");
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save this provider schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function disable(schedule) {
    if (!window.confirm(`Disable ${schedule.provider?.name || "this provider"}'s ${schedule.serviceType} schedule?`)) return;
    setError("");
    setNotice("");
    try {
      await disableProviderSchedule(schedule._id);
      setNotice("Provider schedule disabled.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not disable this provider schedule.");
    }
  }

  return (
    <main className="provider-schedules-page">
      <header className="provider-schedules-header">
        <div><Link to="/appointments" className="appointment-back-link">← Appointments</Link><h1>Provider Schedules</h1><p>Set the clinic hours that drive kiosk availability and provider assignment.</p></div>
      </header>
      {notice && <p className="appointments-notice" role="status">{notice}</p>}
      {error && <p className="appointments-error" role="alert">{error}</p>}

      <section className="appointment-detail-card">
        <h2>{editingId ? "Edit Provider Schedule" : "Add Provider Schedule"}</h2>
        <p className="provider-schedules-hint">Select the provider’s actual duty days and hours. Appointments use 30-minute slots. Existing appointments are protected if a change would move them outside this schedule.</p>
        <form className="provider-schedule-form" onSubmit={save}>
          <label>Service<select className="text-input" value={serviceType} onChange={(event) => { setServiceType(event.target.value); setProviderId(""); }}><option>{SERVICES[0]}</option><option>{SERVICES[1]}</option></select></label>
          <label>Provider<select className="text-input" required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Select provider</option>{providers.map((provider) => <option key={provider._id} value={provider._id}>{provider.name} · {provider.role}</option>)}</select></label>
          {!providers.length && <p className="provider-schedule-empty">No staff accounts with the required provider role are available for this service.</p>}
          <fieldset className="provider-weekday-fieldset"><legend>Duty days</legend><div className="provider-weekday-options">{DAYS.map(([day, label]) => <label key={day}><input type="checkbox" checked={weekdays.includes(day)} onChange={(event) => setWeekdays((current) => event.target.checked ? [...current, day].sort() : current.filter((value) => value !== day))} />{label}</label>)}</div></fieldset>
          <div className="provider-hours-row"><label>Start time<input className="text-input" required type="time" min="08:00" max="20:30" step="1800" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>End time<input className="text-input" required type="time" min="08:30" max="21:00" step="1800" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
          <div className="provider-schedule-actions"><button className="btn btn-primary" type="submit" disabled={saving || loading || !providers.length || !providerId || !weekdays.length}>{saving ? "Saving…" : editingId ? "Update schedule" : "Save schedule"}</button>{editingId && <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel edit</button>}</div>
        </form>
      </section>

      <section className="appointment-detail-card">
        <div className="provider-schedules-list-heading"><h2>Configured Schedules</h2><button className="btn btn-outline btn-sm" type="button" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
        {loading ? <div className="table-empty" role="status">Loading schedules…</div> : schedules.length ? <div className="table-wrap"><table className="data-table provider-schedules-table"><thead><tr><th>Provider</th><th>Service</th><th>Duty days</th><th>Hours</th><th>Status</th><th>Actions</th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule._id}><td><strong>{schedule.provider?.name || "Provider account unavailable"}</strong><span className="appointment-cell-secondary">{schedule.provider?.role}</span></td><td>{schedule.serviceType}</td><td>{dayNames(schedule.weekdays)}</td><td>{schedule.startTime}–{schedule.endTime}</td><td>{schedule.isActive ? "Active" : "Disabled"}</td><td><div className="provider-schedule-actions"><button className="btn btn-outline btn-sm" type="button" onClick={() => editSchedule(schedule)}>{schedule.isActive ? "Edit" : "Edit / reactivate"}</button>{schedule.isActive && <button className="btn btn-danger btn-sm" type="button" onClick={() => disable(schedule)}>Disable</button>}</div></td></tr>)}</tbody></table></div> : <div className="table-empty">No provider schedules configured yet. Kiosk booking currently uses the existing weekday rules until a schedule is added for a service.</div>}
      </section>
    </main>
  );
}
