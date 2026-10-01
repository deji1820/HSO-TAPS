import Student from "../models/Student.js";
import VitalsLog from "../models/VitalsLog.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import ExternalDocument from "../models/ExternalDocument.js";

// GET /api/students/lookup/:studentId  (kiosk "Is this your profile?" screen by studentId or rfidTagUid)
export async function lookupForKiosk(req, res) {
  const { studentId } = req.params;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(studentId);
  const query = isObjectId
    ? { _id: studentId, isActive: true }
    : { $or: [{ studentId }, { rfidTagUid: studentId.toUpperCase() }], isActive: true };

  const student = await Student.findOne(query);
  if (!student) return res.status(404).json({ message: "Student not found" });
  res.json(student);
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
  const [student, vitals, consultations, documents] = await Promise.all([
    Student.findById(req.params.id),
    VitalsLog.find({ student: req.params.id }).sort({ capturedAt: -1 }),
    ConsultationRecord.find({ student: req.params.id }).sort({ visitDate: -1 }),
    ExternalDocument.find({ student: req.params.id }).select("-fileData").sort({ submittedAt: -1 }),
  ]);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const safeDocuments = documents.map((document) => {
    const result = document.toObject();
    if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
    return result;
  });
  res.json({ student, vitals, consultations, documents: safeDocuments });
}

// POST /api/students/bulk-upload  (Admin > Upload Master Data, after CSV/XLSX is parsed client- or server-side)
export async function bulkUpsertStudents(req, res) {
  const { rows, mode } = req.body; // mode: "upsert" | "skip" | "overwrite"
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    try {
      const existing = await Student.findOne({ studentId: row.studentId });
      if (existing && mode === "skip") {
        results.skipped++;
        continue;
      }
      await Student.findOneAndUpdate({ studentId: row.studentId }, row, { upsert: true, new: true });
      existing ? results.updated++ : results.inserted++;
    } catch (err) {
      results.errors.push({ studentId: row.studentId, error: err.message });
    }
  }
  res.json(results);
}
