import { useEffect, useState } from "react";
import KioskHeader from "../components/KioskHeader.jsx";
import "../styles/screens/ProfileCompletion.css";

function localDateInputValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function profileFrom(student) {
  return {
    dateOfBirth: student?.dateOfBirth?.slice?.(0, 10) ?? "",
    sex: student?.sex ?? "",
    email: student?.email ?? "",
    program: student?.program ?? "",
    department: student?.department ?? "",
    guardianContact: student?.guardianContact ?? "",
    schoolYear: student?.schoolYear ?? "",
  };
}

export default function ProfileCompletionScreen({ student, mobile = false, isOnline, onSave, onBack, saving = false, error = "" }) {
  const [profile, setProfile] = useState(() => profileFrom(student));
  const employee = student?.affiliation === "Employee";

  useEffect(() => setProfile(profileFrom(student)), [student]);

  function update(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    await onSave(profile);
  }

  return (
    <div className={`profile-completion-shell${mobile ? " profile-completion-mobile" : " kiosk-shell"}`}>
      {!mobile && <KioskHeader isOnline={isOnline} />}
      <main className="profile-completion-content">
        <p className="profile-completion-eyebrow">{mobile ? "REQUIRED PROFILE SETUP" : "STEP 2 OF 3 · REQUIRED PROFILE SETUP"} · {employee ? "EMPLOYEE" : "STUDENT"}</p>
        <h1>Complete your basic information</h1>
        <p className="profile-completion-intro">Complete the required fields before choosing a clinic service. Your name and ID came from the imported roster.</p>

        <form className="profile-completion-form" onSubmit={submit}>
          <div className="profile-name-row">
            <div><span>Full name</span><strong>{student?.firstName} {student?.lastName}</strong></div>
            <div><span>{employee ? "Employee ID" : "Student ID"}</span><strong>{student?.employeeId || student?.studentId}</strong></div>
          </div>

          <div className="profile-fields-grid">
            <label>Date of birth <em>Required</em>
              <input type="date" max={localDateInputValue()} required value={profile.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} />
            </label>
            <label>Sex <em>Required</em>
              <select required value={profile.sex} onChange={(event) => update("sex", event.target.value)}>
                <option value="">Select an option</option>
                <option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option>
              </select>
            </label>
            <label className="profile-field-wide">Email address <em>Required</em>
              <input type="email" autoComplete="email" required value={profile.email} onChange={(event) => update("email", event.target.value)} />
            </label>
            {employee ? <label className="profile-field-wide">Department <em>Required</em>
              <input type="text" required value={profile.department} onChange={(event) => update("department", event.target.value)} />
            </label> : <>
              <label className="profile-field-wide">Program <em>Required</em>
                <input type="text" required value={profile.program} onChange={(event) => update("program", event.target.value)} />
              </label>
              <p className="profile-field-wide">Year level: <strong>{student?.displayYearLevel || student?.yearLevel || "Set by the clinic from your student number and academic year"}</strong></p>
              <label className="profile-field-wide">School year <em>Required</em>
                <input type="text" required value={profile.schoolYear} onChange={(event) => update("schoolYear", event.target.value)} placeholder="e.g. 2026-2027" />
              </label>
            </>}
            <label className="profile-field-wide">{employee ? "Emergency contact number" : "Guardian contact number"} <em>Required</em>
              <input type="tel" autoComplete="tel" required value={profile.guardianContact} onChange={(event) => update("guardianContact", event.target.value)} />
            </label>
          </div>

          {error && <p className="profile-completion-error" role="alert">{error}</p>}
          <div className="profile-completion-actions">
            {onBack && <button className="profile-secondary" type="button" onClick={onBack} disabled={saving}>Back</button>}
            <button className="profile-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save and continue to services"}</button>
          </div>
        </form>
      </main>
    </div>
  );
}
