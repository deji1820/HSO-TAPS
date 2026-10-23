import Student from "../models/Student.js";
import VitalsLog from "../models/VitalsLog.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import ExternalDocument from "../models/ExternalDocument.js";
import QueueEntry from "../models/QueueEntry.js";
import { SyncLog } from "../models/FormPipeline.js";

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
      if (affiliation === "Employee") normalized.employeeId = personId;
      else delete normalized.employeeId;
      const existing = await Student.findOne({ studentId: personId });
      if (existing && mode === "skip") {
        results.skipped++;
        continue;
      }
      await Student.findOneAndUpdate({ studentId: personId }, normalized, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
      existing ? results.updated++ : results.inserted++;
    } catch (err) {
      results.errors.push({ studentId: row?.studentId || row?.employeeId, error: err.message });
    }
  }
  res.json(results);
}
