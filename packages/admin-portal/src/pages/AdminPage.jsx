import { useRef, useState } from "react";
import { bulkUpload } from "../services/api.js";
import "../styles/pages/Admin.css";

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

// Student.js fields the bulk-upsert route can actually use.
const EXPECTED_COLUMNS = [
  "studentId", "firstName", "lastName", "age", "sex",
  "program", "yearLevel", "guardianContact", "schoolYear",
];

const MODE_OPTIONS = [
  { value: "upsert", label: "Update existing records (UPSERT)", hint: "Insert new rows, update rows that already exist." },
  { value: "skip", label: "Skip existing records", hint: "Only insert rows for students not already in the system." },
  { value: "overwrite", label: "Overwrite completely", hint: "Replace existing student records entirely with the uploaded row." },
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
  const fileInputRef = useRef(null);
  const unrecognizedHeaders = headers.filter((header) => !EXPECTED_COLUMNS.includes(header));

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

      <h2 className="section-title">Upload Master Data</h2>

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
        <p className="dropzone-meta">Supported Format: .csv | Max File Size: 25 MB<br />Recommended Batch Size: ≤ 5,000 rows per file</p>
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
    </div>
  );
}
