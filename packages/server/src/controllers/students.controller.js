import Student from "../models/Student.js";
import VitalsLog from "../models/VitalsLog.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import ExternalDocument from "../models/ExternalDocument.js";
import QueueEntry from "../models/QueueEntry.js";
import { SyncLog } from "../models/FormPipeline.js";
import Appointment from "../models/Appointment.js";
import MedicalProfile from "../models/MedicalProfile.js";
import PatientHistory from "../models/PatientHistory.js";

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
  res.json({
    person: {
      id: person._id,
      personId: person.employeeId || person.studentId,
      affiliation: person.affiliation || "Student",
      firstName: person.firstName,
      lastName: person.lastName,
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
  for (const field of ["rfidTagUid", "age", "sex", "program", "department", "yearLevel", "guardianContact", "email", "schoolYear"]) {
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
  res.json(student);
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
  res.json({ ok: true, person });
}

// PATCH /api/students/profile/:personId (kiosk/mobile profile completion)
export async function completeKioskProfile(req, res) {
  const personId = String(req.params.personId || "").trim();
  const person = await Student.findOne({ $or: [{ studentId: personId }, { employeeId: personId }], isActive: true });
  if (!person) return res.status(404).json({ message: "Student or employee record not found." });

  const { age, sex, email, program, yearLevel, department, guardianContact, schoolYear } = req.body || {};
  const parsedAge = Number(age);
  const allowedSex = ["Male", "Female", "Other", "Prefer not to say"];
  if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) return res.status(400).json({ message: "Enter a valid age." });
  if (!allowedSex.includes(sex)) return res.status(400).json({ message: "Select a valid sex option." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim())) return res.status(400).json({ message: "Enter a valid email address." });
  if (!String(guardianContact || "").trim() || String(guardianContact).length > 40) return res.status(400).json({ message: "Enter a guardian or emergency contact number." });
  if (person.affiliation === "Employee" && !String(department || "").trim()) return res.status(400).json({ message: "Department is required for employee profiles." });
  if (person.affiliation !== "Employee" && (!String(program || "").trim() || !String(yearLevel || "").trim() || !String(schoolYear || "").trim())) {
    return res.status(400).json({ message: "Program, year level, and school year are required for student profiles." });
  }

  person.age = parsedAge;
  person.sex = sex;
  person.email = String(email).trim().toLowerCase();
  person.guardianContact = String(guardianContact || "").trim();
  if (person.affiliation === "Employee") person.department = String(department).trim();
  else {
    person.program = String(program).trim();
    person.yearLevel = String(yearLevel).trim();
    person.schoolYear = String(schoolYear).trim();
  }
  await person.save();
  res.json(person);
}

// GET /api/students  (EMR list screen, filterable by school year / term upstream)
export async function listStudents(req, res) {
  const { q } = req.query;
  const filter = q
    ? { $or: [{ studentId: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }, { firstName: new RegExp(q, "i") }] }
    : {};
  const students = await Student.find(filter).limit(100).sort({ lastName: 1 });
  res.json(students);
}

// GET /api/students/:id/emr  (Consultation History + Vitals + External Documents tabs)
export async function getFullEmr(req, res) {
  const [student, vitals, consultations, documents, kioskRequests, formSubmissions] = await Promise.all([
    Student.findById(req.params.id),
    VitalsLog.find({ student: req.params.id }).sort({ capturedAt: -1 }),
    ConsultationRecord.find({ student: req.params.id }).sort({ visitDate: -1 }),
    ExternalDocument.find({ student: req.params.id }).select("-fileData").sort({ submittedAt: -1 }),
    QueueEntry.find({ student: req.params.id, status: { $ne: "cancelled" } }).sort({ createdAt: -1 }),
    SyncLog.find({ matchedStudent: req.params.id }).sort({ createdAt: -1 }),
  ]);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const safeDocuments = documents.map((document) => {
    const result = document.toObject();
    if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
    return result;
  });
  res.json({ student, vitals, consultations, documents: safeDocuments, kioskRequests, formSubmissions });
}

// POST /api/students/bulk-upload  (Admin > Upload Master Data, after CSV/XLSX is parsed client- or server-side)
export async function bulkUpsertStudents(req, res) {
  const { rows, mode } = req.body || {}; // mode: "upsert" | "skip" | "overwrite"
  if (!Array.isArray(rows)) return res.status(400).json({ message: "Rows must be an array." });
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    try {
      const rawAffiliation = String(row.affiliation || (row.employeeId ? "Employee" : "Student")).trim().toLowerCase();
      const affiliation = rawAffiliation === "employee" ? "Employee" : rawAffiliation === "student" ? "Student" : rawAffiliation;
      const personId = String(row.employeeId || row.studentId || "").trim();
      if (!personId || !row.firstName || !row.lastName) throw new Error("ID, first name, and last name are required.");
      if (!["Student", "Employee"].includes(affiliation)) throw new Error("Affiliation must be Student or Employee.");
      const normalized = { ...row, studentId: personId, affiliation };
      normalized.isActive = true;
      if (affiliation === "Employee") normalized.employeeId = personId;
      else delete normalized.employeeId;
      const existing = await Student.findOne({ studentId: personId });
      if (existing && mode === "skip") {
        results.skipped++;
        continue;
      }
      if (mode === "overwrite") {
        // A complete roster replacement clears profile fields omitted from the
        // import and unlinks any RFID card, while preserving the Mongo record
        // identity and separate clinical-history documents.
        const profileFields = ["age", "sex", "program", "department", "yearLevel", "guardianContact", "schoolYear", "email"];
        const unset = { rfidTagUid: 1 };
        delete normalized.rfidTagUid;
        for (const field of profileFields) {
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
