import { useEffect, useRef, useState } from "react";
import {
  archiveRosterRecord,
  bulkUpload,
  deleteRosterRecord,
  getAcademicCalendar,
  getRosterRecord,
  resetRosterProfile,
  resetRosterRfid,
  restoreRosterRecord,
  updateAcademicCalendar,
  updateYearLevelOverride,
} from "../services/api.js";
import "../styles/pages/Admin.css";
import { appDialog } from "../../../shared-ui/src/dialogService.js";

// Small hand-rolled CSV parser — no papaparse in this project's dependencies,
// so this avoids assuming one. Handles comma-separated + double-quoted fields;
// not full RFC 4180 (e.g. no embedded newlines inside quoted fields).
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  function parseLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const cells = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

// Roster fields accepted for both students and employees.
const EXPECTED_COLUMNS = [
  "affiliation", "studentId", "employeeId", "firstName", "lastName", "dateOfBirth", "sex",
  "program", "department", "yearLevel", "guardianContact", "schoolYear", "email",
];

const MODE_OPTIONS = [
  { value: "upsert", label: "Update existing records (UPSERT)", hint: "Insert new rows, update rows that already exist." },
  { value: "skip", label: "Skip existing records", hint: "Only insert rows for students not already in the system." },
  { value: "overwrite", label: "Overwrite completely", hint: "Replace roster details, clear omitted fields, and unlink RFID. Clinical history is preserved." },
];

export default function AdminPage() {
  const [fileName, setFileName] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mode, setMode] = useState("upsert");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rosterSearchId, setRosterSearchId] = useState("");
  const [rosterRecord, setRosterRecord] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterAction, setRosterAction] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [rosterNotice, setRosterNotice] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [academicCalendarSource, setAcademicCalendarSource] = useState("unconfigured");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const fileInputRef = useRef(null);
  const unrecognizedHeaders = headers.filter((header) => !EXPECTED_COLUMNS.includes(header));

  useEffect(() => {
    getAcademicCalendar().then((calendar) => {
      setAcademicYear(calendar.currentAcademicYear || "");
      setAcademicCalendarSource(calendar.source || "unconfigured");
    }).catch(() => setCalendarError("Could not load the academic calendar setting."));
  }, []);

  async function saveAcademicYear(event) {
    event.preventDefault();
    setCalendarSaving(true); setCalendarError(""); setCalendarNotice("");
    try {
      const saved = await updateAcademicCalendar(academicYear);
      setAcademicYear(saved.currentAcademicYear);
      setAcademicCalendarSource("database");
      setCalendarNotice("Academic year saved. Expected year levels will recalculate on the next patient lookup or record refresh.");
    } catch (saveError) {
      setCalendarError(saveError.response?.data?.message || "Could not save the academic year.");
    } finally { setCalendarSaving(false); }
  }

  function processFile(file) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { headers: h, rows: r } = parseCsv(String(reader.result));
      setHeaders(h);
      setRows(r);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  function handleFileInput(e) {
    processFile(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  }

  async function handleSubmit() {
    if (rows.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await bulkUpload(rows, mode);
      setResult(res);
    } catch {
      setError("Upload failed. Check that the server is running and the file format is correct.");
    } finally {
      setUploading(false);
    }
  }

  async function searchRosterRecord(event) {
    event.preventDefault();
    if (!rosterSearchId.trim()) return;
    setRosterLoading(true);
    setRosterError("");
    setRosterNotice("");
    setRosterRecord(null);
    try {
      setRosterRecord(await getRosterRecord(rosterSearchId.trim()));
    } catch (lookupError) {
      setRosterError(lookupError?.response?.data?.message || "Could not find that roster record.");
    } finally {
      setRosterLoading(false);
    }
  }

  async function editYearLevelOverride() {
    if (!rosterRecord?.person || rosterRecord.person.affiliation !== "Student") return;
    const next = await appDialog.prompt("Official year-level override (leave blank to use the cohort expectation):", rosterRecord.person.yearLevelOverride || "", "Edit year-level override");
    if (next === null) return;
    const override = next.trim();
    const reason = override ? await appDialog.prompt("Reason for this authorized override:", rosterRecord.person.yearLevelOverrideReason || "", "Override reason", true) : "";
    if (override && reason === null) return;
    try {
      await updateYearLevelOverride(rosterRecord.person.personId, override, reason || "");
      setRosterRecord(await getRosterRecord(rosterRecord.person.personId));
      setRosterNotice(override ? "Year-level override saved." : "Year-level override removed.");
      setRosterError("");
    } catch (overrideError) {
      setRosterError(overrideError.response?.data?.message || "Could not save the year-level override.");
    }
  }

  async function runRosterAction(action) {
    if (!rosterRecord || rosterAction) return;
    const person = rosterRecord.person;
    const prompts = {
      resetProfile: `Reset ${person.firstName} ${person.lastName}'s profile details and RFID link? Their roster ID and clinical history will be preserved.`,
      resetRfid: `Unlink the RFID card from ${person.firstName} ${person.lastName}?`,
      archive: `Archive ${person.firstName} ${person.lastName} from the active roster? Their clinical history will be preserved.`,
      restore: `Restore ${person.firstName} ${person.lastName} to the active roster? They may need to register their RFID card again.`,
      delete: `Permanently delete ${person.firstName} ${person.lastName}'s roster record? This cannot be undone.`,
    };
    if (!await appDialog.confirm(prompts[action], "Confirm roster action")) return;

    setRosterAction(true);
    setRosterError("");
    setRosterNotice("");
    try {
      const result = action === "resetProfile" ? await resetRosterProfile(person.personId)
        : action === "resetRfid" ? await resetRosterRfid(person.personId)
          : action === "archive" ? await archiveRosterRecord(person.personId)
            : action === "restore" ? await restoreRosterRecord(person.personId)
              : await deleteRosterRecord(person.personId);
      setRosterNotice(result.message);
      if (action === "delete") setRosterRecord(null);
      else setRosterRecord(await getRosterRecord(person.personId));
    } catch (actionError) {
      setRosterError(actionError?.response?.data?.message || "The roster action failed. Please try again.");
    } finally {
      setRosterAction(false);
    }
  }

  function resetAll() {
    setFileName(null);
    setRows([]);
    setHeaders([]);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <div className="page-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1>Admin</h1>
      </div>

      <h2 className="section-title">Academic Calendar</h2>
      <section className="card roster-management" aria-label="Academic calendar configuration">
        <p>Set the current academic year used to calculate expected student year levels from valid cohort years in student numbers. Student year-level overrides remain in effect.</p>
        <form className="roster-search-form" onSubmit={saveAcademicYear}>
          <label htmlFor="current-academic-year">Current academic year</label>
          <div className="roster-search-row"><input id="current-academic-year" className="text-input" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="2026-2027" pattern="\\d{4}-\\d{4}" required /><button className="btn btn-primary" type="submit" disabled={calendarSaving}>{calendarSaving ? "Saving…" : "Save academic year"}</button></div>
        </form>
        <p className="page-subtitle">Source: {academicCalendarSource}. A year level is calculated only when a valid academic year and student number are available.</p>
        {calendarError && <p className="error-text" role="alert">{calendarError}</p>}{calendarNotice && <p className="roster-notice" role="status">{calendarNotice}</p>}
      </section>

      <h2 className="section-title">Upload Student &amp; Employee Master Data</h2>

      <div
        className={"dropzone" + (isDragging ? " dragging" : "")}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--nu-gold-dark)" strokeWidth="1.6">
          <path d="M12 16V4M12 4 7 9M12 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="dropzone-title">Drag &amp; Drop CSV file here</p>
        <p className="dropzone-sub">or <span className="dropzone-link">Browse Files</span></p>
        <p className="dropzone-meta">Required CSV columns: studentId (students) or employeeId (employees), firstName, and lastName. Affiliation and other profile fields are optional and can be added later.<br />Rows with employeeId and no affiliation are treated as employees; other rows default to students. Max File Size: 25 MB · Recommended Batch Size: ≤ 5,000 rows</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
      </div>

      {fileName && (
        <p className="file-selected">
          <strong>File Selected:</strong> {fileName} — {rows.length} row(s) found
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 12 }} onClick={resetAll}>Clear</button>
        </p>
      )}

      {rows.length > 0 && (
        <>
          <h2 className="section-title">Data Preview &amp; Mapping Validation</h2>
          {unrecognizedHeaders.length > 0 && (
            <div className="field-warning" role="alert">
              <strong>Unrecognized CSV field name{unrecognizedHeaders.length > 1 ? "s" : ""}:</strong>{" "}
              {unrecognizedHeaders.map((header) => <code key={header}>{header || "(blank header)"}</code>)}
              <span> These column{unrecognizedHeaders.length > 1 ? "s" : ""} will be ignored. Rename them to a supported field before uploading if they contain data you need to import.</span>
            </div>
          )}
          <div className="table-wrap" style={{ marginBottom: 20 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Excel Column</th>
                  <th>Detected Field Mapping</th>
                  <th>Sample Data Row</th>
                  <th>Validation Status</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => {
                  const recognized = EXPECTED_COLUMNS.includes(h);
                  return (
                    <tr key={h}>
                      <td>{h}</td>
                      <td>{recognized ? h : "—"}</td>
                      <td>{rows[0]?.[h] || "—"}</td>
                      <td>
                        <span className={"badge " + (recognized ? "badge-routine" : "badge-high")}>
                          {recognized ? "Recognized" : "Unrecognized — will be ignored"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <p className="page-subtitle" style={{ marginTop: -12, marginBottom: 20 }}>
              Showing preview based on first row. {rows.length} total rows will be uploaded.
            </p>
          )}

          <h2 className="section-title">Import Options</h2>
          <div className="card import-options">
            <p className="field-label">Action on Existing Records:</p>
            <div className="radio-group">
              {MODE_OPTIONS.map((opt) => (
                <label key={opt.value} className={"radio-option" + (mode === opt.value ? " selected" : "")}>
                  <input
                    type="radio"
                    name="import-mode"
                    value={opt.value}
                    checked={mode === opt.value}
                    onChange={() => setMode(opt.value)}
                  />
                  <div>
                    <div className="radio-option-label">{opt.label}</div>
                    <div className="radio-option-hint">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="import-actions">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading}>
                {uploading ? "Processing…" : "Process & Upload"}
              </button>
            </div>
          </div>
        </>
      )}

      {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}

      {result && (
        <div className="card upload-result" role="status" aria-live="polite">
          <h2>Upload Complete</h2>
          <p className="upload-confirmation">The CSV upload has finished successfully.</p>
          <div className="upload-result-stats">
            <div><span className="badge badge-routine">{result.inserted}</span> Inserted</div>
            <div><span className="badge badge-standard">{result.updated}</span> Updated</div>
            <div><span className="badge badge-active" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>{result.skipped}</span> Skipped</div>
          </div>
          {result.errors?.length > 0 && (
            <>
              <p className="error-text" style={{ marginTop: 12 }}>{result.errors.length} row(s) had errors:</p>
              <ul className="upload-error-list">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.studentId || "(unknown ID)"}: {e.error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <h2 className="section-title roster-management-title">Manage Roster Records</h2>
      <section className="card roster-management" aria-label="Roster record management">
        <p>Search by student or employee ID to reset RFID enrollment, clear profile details, archive or restore a record, or permanently delete a record without linked history.</p>
        <form className="roster-search-form" onSubmit={searchRosterRecord}>
          <label htmlFor="roster-person-id">Student or employee ID</label>
          <div className="roster-search-row">
            <input id="roster-person-id" className="text-input" value={rosterSearchId} onChange={(event) => setRosterSearchId(event.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={rosterLoading || !rosterSearchId.trim()}>{rosterLoading ? "Searching…" : "Search"}</button>
          </div>
        </form>
        {rosterError && <p className="error-text" role="alert">{rosterError}</p>}
        {rosterNotice && <p className="roster-notice" role="status">{rosterNotice}</p>}
        {rosterRecord && (
          <div className="roster-record-card">
            <div className="roster-record-summary">
              <strong>{rosterRecord.person.firstName} {rosterRecord.person.lastName}</strong>
              <span>{rosterRecord.person.personId} · {rosterRecord.person.affiliation}</span>
              <span>{rosterRecord.person.isActive ? "Active record" : "Archived record"} · {rosterRecord.person.hasRfid ? "RFID linked" : "No RFID linked"}</span>
              {rosterRecord.person.affiliation === "Student" && <span>Expected year level: {rosterRecord.person.expectedYearLevel || "Unavailable"} · Displayed: {rosterRecord.person.displayYearLevel || "Not assigned"}</span>}
              {rosterRecord.person.yearLevelOverride && <span>Authorized override: {rosterRecord.person.yearLevelOverride} · {rosterRecord.person.yearLevelOverrideReason}</span>}
            </div>
            {rosterRecord.hasLinkedRecords && <p className="roster-history-note">This record has linked clinical history. Permanent deletion is disabled; archive it to remove it from the active roster.</p>}
            <div className="roster-actions">
              {rosterRecord.person.affiliation === "Student" && <button className="btn btn-outline" type="button" disabled={rosterAction} onClick={editYearLevelOverride}>{rosterRecord.person.yearLevelOverride ? "Edit / remove year-level override" : "Set year-level override"}</button>}
              <button className="btn btn-outline" type="button" disabled={rosterAction || !rosterRecord.person.isActive} onClick={() => runRosterAction("resetProfile")}>{rosterAction ? "Working…" : "Reset profile &amp; RFID"}</button>
              <button className="btn btn-outline" type="button" disabled={rosterAction || !rosterRecord.person.hasRfid} onClick={() => runRosterAction("resetRfid")}>Reset RFID only</button>
              {rosterRecord.person.isActive
                ? <button className="btn btn-outline" type="button" disabled={rosterAction} onClick={() => runRosterAction("archive")}>Archive</button>
                : <button className="btn btn-outline" type="button" disabled={rosterAction} onClick={() => runRosterAction("restore")}>Restore to active roster</button>}
              <button className="btn btn-danger" type="button" disabled={rosterAction || rosterRecord.hasLinkedRecords} onClick={() => runRosterAction("delete")}>Delete permanently</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
