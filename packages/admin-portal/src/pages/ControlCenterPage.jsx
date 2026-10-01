import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { normalizeRole } from "../utils/roles.js";
import "../styles/pages/ControlCenter.css";

const MODULES = [
  { title: "Dashboard", description: "Live queue and patient check-in", to: "/dashboard", icon: "dashboard", tone: "green" },
  { title: "Electronic Medical Records", description: "Student profiles and clinical history", to: "/emr", icon: "folder", tone: "green" },
  { title: "Booking Appointments", description: "View scheduled clinic appointments", to: "/appointments", icon: "document", tone: "green" },
  { title: "Medicine Inventory", description: "Track medicines, supplies, and stock levels", to: "/inventory", icon: "inventory", tone: "green" },
  { title: "Data Analytics", description: "Clinic visits and service summaries", to: "/analytics", icon: "chart", tone: "green" },
  { title: "Admin", description: "Manage student master data", to: "/admin", icon: "list", tone: "green" },
];

function ModuleIcon({ type }) {
  const common = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true };
  if (type === "dashboard") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" stroke="none" /><rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" stroke="none" /></svg>;
  if (type === "folder") return <svg {...common}><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" fill="currentColor" stroke="none" /></svg>;
  if (type === "document") return <svg {...common}><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" stroke="none" /><path d="M14 3v5h5" stroke="white" /><path d="M8 13h8M8 16h8" stroke="white" /></svg>;
  if (type === "inventory") return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z" fill="currentColor" stroke="none" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></svg>;
  if (type === "chart") return <svg {...common}><path d="M4 20V11M10 20V5M16 20v-7M22 20V9" strokeWidth="3" /></svg>;
  return <svg {...common}><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>;
}

export default function ControlCenterPage({ user }) {
  const [search, setSearch] = useState("");
  const role = normalizeRole(user?.role);
  const allowedModules = role === "superadmin"
    ? MODULES.filter((module) => module.title === "Admin")
    : role === "supervisor"
      ? MODULES.filter((module) => module.title !== "Admin")
      : role === "physician" || role === "dentist"
        ? MODULES.filter((module) => !["Admin", "Medicine Inventory", "Data Analytics"].includes(module.title))
        : MODULES.filter((module) => module.title !== "Admin" && (module.title !== "Medicine Inventory" || role === "nurse"));
  const modules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? allowedModules.filter((module) => `${module.title} ${module.description}`.toLowerCase().includes(query)) : allowedModules;
  }, [search, role]);

  return (
    <main className="control-center">
      <div className="control-center-heading">
        <div className="control-center-title">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="m2 11 10-9 10 9-1.5 1.6L19 11.2V21h-5v-6h-4v6H5v-9.8l-1.5 1.4L2 11Z" /></svg>
          <h1>Control Center</h1>
        </div>
        <label className="control-center-search">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." aria-label="Search modules" />
        </label>
      </div>

      <div className="control-center-grid">
        {modules.map((module) => {
          const content = (
            <>
              <ModuleIcon type={module.icon} />
              <span className="control-module-copy">
                <strong>{module.title}</strong>
                <small>{module.description}</small>
              </span>
            </>
          );
          return module.disabled ? (
            <div key={module.title} className="control-module control-module-disabled" aria-disabled="true" title="This module is not available yet">
              {content}
            </div>
          ) : (
            <Link key={module.title} className="control-module" to={module.to}>
              {content}
            </Link>
          );
        })}
        {modules.length === 0 && <p className="control-center-empty">No modules match “{search}”.</p>}
      </div>
    </main>
  );
}
