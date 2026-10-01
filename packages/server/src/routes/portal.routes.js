import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import Student from "../models/Student.js";
import QueueEntry from "../models/QueueEntry.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import VitalsLog from "../models/VitalsLog.js";
import ExternalDocument from "../models/ExternalDocument.js";
import MedicalProfile from "../models/MedicalProfile.js";
import PatientHistory from "../models/PatientHistory.js";
import Announcement from "../models/Announcement.js";
import MedicineInventory from "../models/MedicineInventory.js";

const router = Router();
router.use(requireAuth);
const validId = (id) => mongoose.isValidObjectId(id);
const inventoryFields = ["name", "genericName", "category", "quantity", "unit", "reorderLevel", "expiryDate", "batchNumber", "supplier", "notes"];
const inventoryInput = (body) => Object.fromEntries(Object.entries(body || {}).filter(([key]) => inventoryFields.includes(key)));
function requireInventoryAccess(req, res, next) {
  if (!["nurse", "supervisor", "superadmin"].includes(req.user.role)) return res.status(403).json({ message: "You do not have access to medicine inventory" });
  next();
}

router.get("/inventory", requireInventoryAccess, async (_req, res) => {
  res.json(await MedicineInventory.find({ isActive: true }).sort({ name: 1 }));
});
router.post("/inventory", requireInventoryAccess, async (req, res) => {
  const item = await MedicineInventory.create(inventoryInput(req.body));
  res.status(201).json(item);
});
router.patch("/inventory/:id", requireInventoryAccess, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid inventory item ID" });
  const updates = inventoryInput(req.body);
  const item = await MedicineInventory.findOneAndUpdate({ _id: req.params.id, isActive: true }, { $set: updates }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ message: "Inventory item not found" });
  res.json(item);
});
router.delete("/inventory/:id", requireInventoryAccess, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid inventory item ID" });
  const item = await MedicineInventory.findOneAndUpdate({ _id: req.params.id, isActive: true }, { isActive: false }, { new: true });
  if (!item) return res.status(404).json({ message: "Inventory item not found" });
  res.json({ deleted: true, id: item._id });
});

router.post("/consultations", async (req, res) => {
  const { queueEntryId, visitType, secondaryVitals = {} } = req.body;
  const queueEntry = await QueueEntry.findById(queueEntryId).populate("student").populate("linkedVitals");
  if (!queueEntry) return res.status(404).json({ message: "Queue entry not found" });
  const allowed = ["Walk-in Medical Consultation", "Dental Consultation", "Medication and Relief", "General Inquiry"];
  if (!allowed.includes(visitType)) return res.status(400).json({ message: "Invalid visit type" });
  const fields = ["bloodPressure", "pulseRate", "spo2"];
  const hasVitals = fields.some((field) => secondaryVitals[field] !== undefined && secondaryVitals[field] !== "");
  if (hasVitals) await VitalsLog.create({ student: queueEntry.student._id, source: "manual_staff_entry", ...secondaryVitals });
  const { queueEntryId: _id, secondaryVitals: _vitals, ...recordFields } = req.body;
  const consultation = await ConsultationRecord.create({
    ...recordFields, student: queueEntry.student._id, queueEntry: queueEntry._id,
    attendingStaff: req.user.id, visitType,
    vitalsSnapshot: { ...(queueEntry.linkedVitals?.toObject?.() || {}), ...secondaryVitals },
  });
  queueEntry.status = "completed";
  queueEntry.completedAt = new Date();
  await queueEntry.save();
  const updated = await QueueEntry.findById(queueEntry._id).populate("student").populate("linkedVitals");
  req.app.get("io")?.emit("queue:update", updated);
  res.status(201).json({ consultation, queueEntry: updated });
});

router.get("/students/:id/medical-profiles", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  res.json(await MedicalProfile.find({ student: req.params.id }).sort({ examinedAt: -1 }));
});
router.post("/students/:id/medical-profiles", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const profile = await MedicalProfile.create({ ...req.body, student: student._id, studentId: student.studentId });
  res.status(201).json(profile);
});
router.get("/students/:id/history", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const history = await PatientHistory.findOne({ student: req.params.id });
  res.json(history || { familyHistory: { answers: {}, others: "" }, medicalHistory: { answers: {} } });
});
router.put("/students/:id/history", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const history = await PatientHistory.findOneAndUpdate({ student: student._id }, {
    $set: { familyHistory: req.body.familyHistory, medicalHistory: req.body.medicalHistory },
  }, { upsert: true, new: true, runValidators: true });
  res.json(history);
});
router.post("/students/:id/documents", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const { title, category, name, contentType, fileData } = req.body;
  if (!title || !name || !fileData) return res.status(400).json({ message: "Title and file are required" });
  const bytes = Buffer.from(fileData, "base64");
  if (bytes.length > 12 * 1024 * 1024) return res.status(413).json({ message: "File exceeds the 12 MB limit" });
  const document = await ExternalDocument.create({
    student: student._id, documentTitle: title, category, name, contentType,
    fileData: bytes, formSource: "Admin Portal", status: "Pending", submittedAt: new Date(),
  });
  const result = document.toObject();
  delete result.fileData;
  result.fileUrl = `/api/documents/${document._id}/file`;
  res.status(201).json(result);
});
router.get("/documents", async (_req, res) => {
  const documents = await ExternalDocument.find().select("-fileData").populate("student", "studentId firstName lastName").sort({ submittedAt: -1, createdAt: -1 });
  res.json(documents.map((document) => {
    const result = document.toObject();
    if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
    return result;
  }));
});
router.get("/documents/:id/file", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid document ID" });
  const document = await ExternalDocument.findById(req.params.id).select("name contentType fileData");
  if (!document?.fileData) return res.status(404).json({ message: "File not found" });
  res.type(document.contentType || "application/octet-stream").attachment(document.name).send(document.fileData);
});
router.get("/announcement", async (_req, res) => {
  const announcement = await Announcement.findOneAndUpdate({ key: "dashboard" }, { $setOnInsert: { text: "Health Services Office announcements will appear here." } }, { upsert: true, new: true });
  res.json({ text: announcement.text });
});
router.put("/announcement", async (req, res) => {
  if (!['supervisor', 'superadmin'].includes(req.user.role)) return res.status(403).json({ message: "Only supervisors can edit announcements" });
  if (typeof req.body.text !== "string" || !req.body.text.trim()) return res.status(400).json({ message: "Announcement text is required" });
  const announcement = await Announcement.findOneAndUpdate({ key: "dashboard" }, { text: req.body.text.trim() }, { upsert: true, new: true });
  req.app.get("io")?.emit("announcement:update", { text: announcement.text });
  res.json({ text: announcement.text });
});
export default router;
