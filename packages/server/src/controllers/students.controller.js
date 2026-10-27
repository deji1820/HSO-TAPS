import Student from "../models/Student.js";
import VitalsLog from "../models/VitalsLog.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import ExternalDocument from "../models/ExternalDocument.js";
import QueueEntry from "../models/QueueEntry.js";
import { SyncLog } from "../models/FormPipeline.js";
import Appointment from "../models/Appointment.js";
import MedicalProfile from "../models/MedicalProfile.js";
import MedicalWorkflow from "../models/MedicalWorkflow.js";
import PatientHistory from "../models/PatientHistory.js";
import AcademicCalendar from "../models/AcademicCalendar.js";
import { calculateAge, decoratePatientYearLevel, expectedYearLevel, parseAcademicYearStart } from "../services/patientInformation.js";
import { findClearanceRequirement } from "../services/clearanceRequirements.js";
import { issueVerifiedClearanceDocument } from "../services/clearanceCertificate.service.js";

function decoratePatient(person, academicYear) {
  return decoratePatientYearLevel(person, academicYear);
}

async function currentAcademicYear() {
  const setting = await AcademicCalendar.findOne({ key: "current" }).select("currentAcademicYear").lean();
  const configured = setting?.currentAcademicYear || process.env.HSO_CURRENT_ACADEMIC_YEAR || "";
  return parseAcademicYearStart(configured) ? configured : null;
}

export async function getAcademicCalendar(_req, res) {
  const setting = await AcademicCalendar.findOne({ key: "current" }).populate("updatedBy", "name").lean();
  res.json({ currentAcademicYear: setting?.currentAcademicYear || process.env.HSO_CURRENT_ACADEMIC_YEAR || "", source: setting ? "database" : process.env.HSO_CURRENT_ACADEMIC_YEAR ? "environment" : "unconfigured", updatedAt: setting?.updatedAt || null, updatedBy: setting?.updatedBy || null });
}

export async function updateAcademicCalendar(req, res) {
  const currentAcademicYear = String(req.body?.currentAcademicYear || "").trim().replace(/^AY\s*/i, "");
  if (!parseAcademicYearStart(currentAcademicYear)) return res.status(400).json({ message: "Enter an academic year such as 2026-2027." });
  const setting = await AcademicCalendar.findOneAndUpdate(
    { key: "current" },
    { $set: { currentAcademicYear, updatedBy: req.user.id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).populate("updatedBy", "name");
  res.json(setting);
}

export async function updateYearLevelOverride(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  if (person.affiliation !== "Student") return res.status(400).json({ message: "Year-level overrides apply to student records only." });
  const override = String(req.body?.yearLevelOverride || "").trim();
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (override && (!/^(?:[1-8](?:st|nd|rd|th) Year|Grade (?:11|12)|Graduate Studies|Irregular)$/i.test(override) || reason.length < 5)) {
    return res.status(400).json({ message: "Choose a supported year-level override and enter a reason of at least 5 characters." });
  }
  person.yearLevelOverride = override || undefined;
  person.yearLevelOverrideReason = override ? reason : undefined;
  person.yearLevelOverrideBy = override ? req.user.id : undefined;
  person.yearLevelOverrideAt = override ? new Date() : undefined;
  await person.save();
  const academicYear = await currentAcademicYear();
  res.json({ person: decoratePatient(person, academicYear), message: override ? "Year-level override saved." : "Year-level override removed." });
}

async function findRosterPerson(personId) {
  const id = String(personId || "").trim();
  return Student.findOne({ $or: [{ studentId: id }, { employeeId: id }] });
}

async function getLinkedRecordCounts(id) {
  const [vitals, consultations, documents, queueEntries, appointments, medicalProfiles, patientHistories, formSubmissions] = await Promise.all([
    VitalsLog.countDocuments({ student: id }), ConsultationRecord.countDocuments({ student: id }),
    ExternalDocument.countDocuments({ student: id }), QueueEntry.countDocuments({ student: id }),
    Appointment.countDocuments({ student: id }), MedicalProfile.countDocuments({ student: id }),
    PatientHistory.countDocuments({ student: id }), SyncLog.countDocuments({ matchedStudent: id }),
  ]);
  return { vitals, consultations, documents, queueEntries, appointments, medicalProfiles, patientHistories, formSubmissions };
}

function hasLinkedRecords(counts) {
  return Object.values(counts).some((count) => count > 0);
}

// GET /api/students/roster/:personId (superadmin roster management)
export async function getRosterRecord(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  const linkedRecords = await getLinkedRecordCounts(person._id);
  const academicYear = await currentAcademicYear();
  res.json({
    person: {
      id: person._id,
      personId: person.employeeId || person.studentId,
      affiliation: person.affiliation || "Student",
      firstName: person.firstName,
      lastName: person.lastName,
      yearLevel: person.yearLevel,
      yearLevelOverride: person.yearLevelOverride,
      yearLevelOverrideReason: person.yearLevelOverrideReason,
      expectedYearLevel: expectedYearLevel(person.studentId, person.affiliation, academicYear),
      displayYearLevel: person.affiliation === "Student" ? person.yearLevelOverride || expectedYearLevel(person.studentId, person.affiliation, academicYear) || person.yearLevel || null : null,
      isActive: person.isActive !== false,
      hasRfid: Boolean(person.rfidTagUid),
    },
    linkedRecords,
    hasLinkedRecords: hasLinkedRecords(linkedRecords),
  });
}

// PATCH /api/students/roster/:personId/rfid (superadmin)
export async function resetRosterRfid(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  person.rfidTagUid = undefined;
  await person.save();
  res.json({ ok: true, message: "RFID link reset. The person can scan their card to register it again." });
}

// PATCH /api/students/roster/:personId/reset-profile (superadmin)
export async function resetRosterProfile(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  if (person.isActive === false) return res.status(409).json({ message: "This roster record is archived. Restore it before resetting the profile." });
  const resettableFields = ["rfidTagUid", "dateOfBirth", "sex", "program", "department", "yearLevel", "guardianContact", "email", "schoolYear"];
  const declarationFields = new Set(["dateOfBirth", "sex", "program", "department", "guardianContact"]);
  for (const field of resettableFields) {
    if (person.healthDeclarationRecord && declarationFields.has(field)) continue;
    person[field] = undefined;
  }
  await person.save();
  res.json({ ok: true, message: "Profile details and RFID link reset. Roster identity and clinical history were preserved." });
}

// PATCH /api/students/roster/:personId/archive (superadmin)
export async function archiveRosterRecord(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  person.isActive = false;
  person.rfidTagUid = undefined;
  await person.save();
  res.json({ ok: true, message: "Roster record archived and RFID link reset. Existing clinical history is preserved." });
}

// PATCH /api/students/roster/:personId/restore (superadmin)
export async function restoreRosterRecord(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  person.isActive = true;
  await person.save();
  res.json({ ok: true, message: "Roster record restored. The person can use kiosk lookup again; their RFID may need to be registered again." });
}

// DELETE /api/students/roster/:personId (superadmin; only when no linked history exists)
export async function deleteRosterRecord(req, res) {
  const person = await findRosterPerson(req.params.personId);
  if (!person) return res.status(404).json({ message: "Roster record not found." });
  const linkedRecords = await getLinkedRecordCounts(person._id);
  if (hasLinkedRecords(linkedRecords)) {
    return res.status(409).json({ message: "This record has linked clinical history. Archive it to remove it from the active roster while preserving that history.", linkedRecords });
  }
  await person.deleteOne();
  res.json({ ok: true, message: "Roster record permanently deleted." });
}

// GET /api/students/lookup/:studentId  (kiosk "Is this your profile?" screen by studentId or rfidTagUid)
export async function lookupForKiosk(req, res) {
  const { studentId } = req.params;
  const lookupId = String(studentId || "").trim();
  const clauses = [{ studentId: lookupId }, { employeeId: lookupId }, { rfidTagUid: lookupId.toUpperCase() }];
  if (/^[0-9a-fA-F]{24}$/.test(lookupId)) clauses.push({ _id: lookupId });
  const query = { $or: clauses, isActive: true };

  const student = await Student.findOne(query);
  if (!student) return res.status(404).json({ message: "Student or employee not found" });
  res.json(decoratePatient(student, await currentAcademicYear()));
}

// POST /api/students/register-rfid (kiosk, after the person confirms their roster profile)
export async function registerRfidForKiosk(req, res) {
  const personId = String(req.body?.personId || "").trim();
  const rfidTagUid = String(req.body?.rfidTagUid || "").trim().toUpperCase();
  if (!personId || !rfidTagUid || rfidTagUid.length > 128) {
    return res.status(400).json({ message: "A roster ID and valid RFID UID are required." });
  }

  const person = await Student.findOne({ $or: [{ studentId: personId }, { employeeId: personId }], isActive: true });
  if (!person) return res.status(404).json({ message: "The confirmed roster record is no longer available." });
  if (person.rfidTagUid && person.rfidTagUid !== rfidTagUid) {
    return res.status(409).json({ message: "A different RFID card is already linked to this record. Please ask clinic staff for help." });
  }
  const existingTag = await Student.findOne({ rfidTagUid, _id: { $ne: person._id } }).select("_id");
  if (existingTag) return res.status(409).json({ message: "This RFID card is already linked to another record. Please ask clinic staff for help." });

  person.rfidTagUid = rfidTagUid;
  try {
    await person.save();
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "This RFID card is already linked to another record. Please ask clinic staff for help." });
    throw error;
  }
  res.json({ ok: true, person: decoratePatient(person, await currentAcademicYear()) });
}

// PATCH /api/students/profile/:personId (kiosk/mobile profile completion)
export async function completeKioskProfile(req, res) {
  const personId = String(req.params.personId || "").trim();
  const person = await Student.findOne({ $or: [{ studentId: personId }, { employeeId: personId }], isActive: true });
  if (!person) return res.status(404).json({ message: "Student or employee record not found." });

  const { dateOfBirth, sex, email, program, department, guardianContact, schoolYear } = req.body || {};
  const dob = String(dateOfBirth || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || calculateAge(dob) === null) {
    return res.status(400).json({ message: "Enter a valid date of birth within the last 120 years." });
  }
  const [birthYear, birthMonth, birthDay] = dob.split("-").map(Number);
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (birthDate.getUTCFullYear() !== birthYear || birthDate.getUTCMonth() !== birthMonth - 1 || birthDate.getUTCDate() !== birthDay) {
    return res.status(400).json({ message: "Enter a valid date of birth." });
  }
  const allowedSex = ["Male", "Female", "Other", "Prefer not to say"];
  if (!allowedSex.includes(sex)) return res.status(400).json({ message: "Select a valid sex option." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim())) return res.status(400).json({ message: "Enter a valid email address." });
  if (!String(guardianContact || "").trim() || String(guardianContact).length > 40) return res.status(400).json({ message: "Enter a guardian or emergency contact number." });
  if (person.affiliation === "Employee" && !String(department || "").trim()) return res.status(400).json({ message: "Department is required for employee profiles." });
  if (person.affiliation !== "Employee" && (!String(program || "").trim() || !String(schoolYear || "").trim())) {
    return res.status(400).json({ message: "Program and school year are required for student profiles." });
  }

  person.email = String(email).trim().toLowerCase();
  if (!person.healthDeclarationRecord) {
    person.dateOfBirth = birthDate;
    person.sex = sex;
    person.guardianContact = String(guardianContact || "").trim();
  }
  if (person.affiliation === "Employee") {
    if (!person.healthDeclarationRecord) person.department = String(department).trim();
  } else {
    if (!person.healthDeclarationRecord) person.program = String(program).trim();
    // School year remains independently managed. Year level comes from the configured academic year and cohort.
    person.schoolYear = String(schoolYear).trim();
  }
  await person.save();
  res.json(decoratePatient(person, await currentAcademicYear()));
}

// GET /api/students  (EMR list screen, filterable by school year / term upstream)
export async function listStudents(req, res) {
  const { q } = req.query;
  const filter = q
    ? { $or: [{ studentId: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }, { firstName: new RegExp(q, "i") }] }
    : {};
  const [students, academicYear] = await Promise.all([Student.find(filter).limit(100).sort({ lastName: 1 }), currentAcademicYear()]);
  res.json(students.map((student) => decoratePatient(student, academicYear)));
}

// GET /api/students/:id/emr  (Consultation History + Vitals + External Documents tabs)
export async function getFullEmr(req, res) {
  const [student, vitals, consultations, documents, kioskRequests, formSubmissions, medicalWorkflows] = await Promise.all([
    Student.findById(req.params.id),
    VitalsLog.find({ student: req.params.id }).sort({ capturedAt: -1 }),
    ConsultationRecord.find({ student: req.params.id }).sort({ visitDate: -1 }),
    ExternalDocument.find({ student: req.params.id }).select("-fileData").populate("student", "studentId firstName lastName affiliation program department").populate("verifiedBy", "name role").populate("verificationHistory.actor", "name role").populate("declarationHistory.actor", "name role").sort({ submittedAt: -1 }),
    QueueEntry.find({ student: req.params.id, status: { $ne: "cancelled" } }).sort({ createdAt: -1 }),
    SyncLog.find({ matchedStudent: req.params.id }).sort({ createdAt: -1 }),
    MedicalWorkflow.find({ student: req.params.id, service: "Medical Clearance" }).populate("requirements.document", "documentTitle name category status examDate submittedAt").populate("medicalFile", "recordType documentTitle name category status submittedAt submissionDetails").sort({ createdAt: -1 }),
  ]);
  if (!student) return res.status(404).json({ message: "Student not found" });
  await Promise.all(documents.filter((document) => document.status === "Verified").map((document) => issueVerifiedClearanceDocument(document)));
  const generatedCertificates = await ExternalDocument.find({ student: req.params.id, sourceDocument: { $in: documents.map((document) => document._id) } }).select("-fileData").lean();
  const certificatesBySource = new Map(generatedCertificates.map((certificate) => [String(certificate.sourceDocument), certificate]));
  const safeDocuments = documents.map((document) => {
    const result = document.toObject();
    if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
    result.issuedCertificate = certificatesBySource.get(String(result._id)) || null;
    result.clearanceCertificateEligible = result.recordType !== "clearance_certificate" && !result.clearanceWorkflow && Boolean(findClearanceRequirement(student.affiliation, result.submissionDetails?.purpose));
    return result;
  });
  res.json({ student: decoratePatient(student, await currentAcademicYear()), vitals, consultations, documents: safeDocuments, medicalWorkflows, kioskRequests, formSubmissions });
}

// POST /api/students/bulk-upload  (Admin > Upload Master Data, after CSV/XLSX is parsed client- or server-side)
export async function bulkUpsertStudents(req, res) {
  const { rows, mode } = req.body || {}; // mode: "upsert" | "skip" | "overwrite"
  if (!Array.isArray(rows)) return res.status(400).json({ message: "Rows must be an array." });
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const declarationOwnedRosterFields = new Set(["firstName", "middleName", "lastName", "dateOfBirth", "sex", "program", "department", "guardianContact"]);

  for (const row of rows) {
    try {
      const rawAffiliation = String(row.affiliation || (row.employeeId ? "Employee" : "Student")).trim().toLowerCase();
      const affiliation = rawAffiliation === "employee" ? "Employee" : rawAffiliation === "student" ? "Student" : rawAffiliation;
      const personId = String(row.employeeId || row.studentId || "").trim();
      if (!personId || !row.firstName || !row.lastName) throw new Error("ID, first name, and last name are required.");
      if (!["Student", "Employee"].includes(affiliation)) throw new Error("Affiliation must be Student or Employee.");
      const normalized = { ...row, studentId: personId, affiliation };
      delete normalized.age;
      if (normalized.dateOfBirth) {
        const dobText = String(normalized.dateOfBirth).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dobText)) throw new Error("Date of birth must use YYYY-MM-DD format.");
        const [year, month, day] = dobText.split("-").map(Number);
        const dob = new Date(Date.UTC(year, month - 1, day));
        if (dob.getUTCFullYear() !== year || dob.getUTCMonth() !== month - 1 || dob.getUTCDate() !== day || calculateAge(dob) === null) throw new Error("Date of birth is invalid or in the future.");
        normalized.dateOfBirth = dob;
      }
      normalized.isActive = true;
      if (affiliation === "Employee") normalized.employeeId = personId;
      else delete normalized.employeeId;
      const existing = await Student.findOne({ studentId: personId });
      if (existing?.healthDeclarationRecord) {
        // Imported roster refreshes must not supersede fields owned by the patient's submitted declaration.
        for (const field of declarationOwnedRosterFields) delete normalized[field];
      }
      if (existing && mode === "skip") {
        results.skipped++;
        continue;
      }
      if (mode === "overwrite") {
        // A complete roster replacement clears profile fields omitted from the
        // import and unlinks any RFID card, while preserving the Mongo record
        // identity and separate clinical-history documents.
        const profileFields = ["dateOfBirth", "sex", "program", "department", "yearLevel", "guardianContact", "schoolYear", "email"];
        delete normalized.age;
        const unset = { rfidTagUid: 1 };
        delete normalized.rfidTagUid;
        for (const field of profileFields) {
          if (existing?.healthDeclarationRecord && declarationOwnedRosterFields.has(field)) continue;
          if (normalized[field] == null || String(normalized[field]).trim() === "") {
            unset[field] = 1;
            delete normalized[field];
          }
        }
        if (affiliation !== "Employee") unset.employeeId = 1;
        await Student.findOneAndUpdate(
          { studentId: personId },
          { $set: normalized, $unset: unset },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
        );
      } else {
        await Student.findOneAndUpdate({ studentId: personId }, normalized, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
      }
      existing ? results.updated++ : results.inserted++;
    } catch (err) {
      results.errors.push({ studentId: row?.studentId || row?.employeeId, error: err.message });
    }
  }
  res.json(results);
}
