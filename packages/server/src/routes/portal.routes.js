import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import Student from "../models/Student.js";
import QueueEntry from "../models/QueueEntry.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import VitalsLog from "../models/VitalsLog.js";
import ExternalDocument from "../models/ExternalDocument.js";
import MedicalProfile from "../models/MedicalProfile.js";
import PatientHistory from "../models/PatientHistory.js";
import Announcement from "../models/Announcement.js";
import MedicineInventory from "../models/MedicineInventory.js";
import { healthDeclarationToPdf } from "../services/healthDeclarationPdf.js";
import { areDocumentNotificationsConfigured, sendDocumentStatusNotification } from "../services/documentNotifications.service.js";

const router = Router();
router.use(requireAuth);
const validId = (id) => mongoose.isValidObjectId(id);
const inventoryFields = ["name", "genericName", "category", "quantity", "unit", "reorderLevel", "expiryDate", "batchNumber", "supplier", "notes"];
const inventoryInput = (body) => Object.fromEntries(Object.entries(body || {}).filter(([key]) => inventoryFields.includes(key)));
const requireClinicalRole = requireRole("nurse", "supervisor", "physician", "dentist");
const requireNurseOrSupervisor = requireRole("nurse", "supervisor");
const requireDocumentRole = requireRole("nurse", "supervisor", "physician", "dentist");

router.get("/inventory", requireClinicalRole, async (_req, res) => {
  res.json(await MedicineInventory.find({ isActive: true }).sort({ name: 1 }));
});
router.post("/inventory", requireNurseOrSupervisor, async (req, res) => {
  const item = await MedicineInventory.create(inventoryInput(req.body));
  res.status(201).json(item);
});
router.patch("/inventory/:id", requireNurseOrSupervisor, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid inventory item ID" });
  const updates = inventoryInput(req.body);
  const item = await MedicineInventory.findOneAndUpdate({ _id: req.params.id, isActive: true }, { $set: updates }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ message: "Inventory item not found" });
  res.json(item);
});
router.delete("/inventory/:id", requireNurseOrSupervisor, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid inventory item ID" });
  const item = await MedicineInventory.findOneAndUpdate({ _id: req.params.id, isActive: true }, { isActive: false }, { new: true });
  if (!item) return res.status(404).json({ message: "Inventory item not found" });
  res.json({ deleted: true, id: item._id });
});

router.post("/consultations", requireClinicalRole, async (req, res) => {
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
  req.app.get("io")?.to("clinical-queue").emit("queue:update", updated);
  req.app.get("io")?.to("frontdesk-queue").emit("queue:update", { _id: updated._id, status: updated.status, calledAt: updated.calledAt, startedAt: updated.startedAt, completedAt: updated.completedAt });
  res.status(201).json({ consultation, queueEntry: updated });
});

router.get("/students/:id/medical-profiles", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  res.json(await MedicalProfile.find({ student: req.params.id }).sort({ examinedAt: -1 }));
});
router.post("/students/:id/medical-profiles", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const profile = await MedicalProfile.create({ ...req.body, student: student._id, studentId: student.studentId });
  res.status(201).json(profile);
});
router.put("/medical-profiles/:id", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid medical profile ID" });
  const fields = req.body?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return res.status(400).json({ message: "Medical profile fields are required" });
  const updates = { fields };
  if (typeof req.body.purpose === "string" && req.body.purpose.trim()) updates.purpose = req.body.purpose.trim();
  if (typeof req.body.provider === "string") updates.provider = req.body.provider.trim();
  const profile = await MedicalProfile.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!profile) return res.status(404).json({ message: "Medical profile not found" });
  res.json(profile);
});
router.get("/students/:id/history", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const history = await PatientHistory.findOne({ student: req.params.id });
  res.json(history || { familyHistory: { answers: {}, others: "" }, medicalHistory: { answers: {} } });
});
router.put("/students/:id/history", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const history = await PatientHistory.findOneAndUpdate({ student: student._id }, {
    $set: { familyHistory: req.body.familyHistory, medicalHistory: req.body.medicalHistory },
  }, { upsert: true, new: true, runValidators: true });
  res.json(history);
});
router.post("/students/:id/documents", requireDocumentRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  const { title, category, name, contentType, fileData } = req.body;
  const notificationEmail = String(req.body.notificationEmail || student.email || "").trim().toLowerCase();
  if (!title || !name || !fileData) return res.status(400).json({ message: "Title and file are required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) return res.status(400).json({ message: "Enter a valid student email address to send the submission notice." });
  const bytes = Buffer.from(fileData, "base64");
  if (bytes.length > 12 * 1024 * 1024) return res.status(413).json({ message: "File exceeds the 12 MB limit" });
  const document = await ExternalDocument.create({
    student: student._id, documentTitle: title, category, name, contentType,
    fileData: bytes, formSource: "Admin Portal", status: "Pending", notificationEmail, submittedAt: new Date(),
  });
  student.email = notificationEmail;
  await student.save();
  const notificationQueued = areDocumentNotificationsConfigured();
  if (notificationQueued) void sendDocumentStatusNotification(document, "Pending", notificationEmail);
  const result = document.toObject();
  delete result.fileData;
  result.fileUrl = `/api/documents/${document._id}/file`;
  res.status(201).json({ ...result, notificationQueued, notificationMessage: notificationQueued ? undefined : "Email settings are incomplete on the server." });
});
router.get("/documents", requireDocumentRole, async (_req, res) => {
  const documents = await ExternalDocument.find().select("-fileData").populate("student", "studentId firstName lastName").sort({ submittedAt: -1, createdAt: -1 });
  res.json(documents.map((document) => {
    const result = document.toObject();
    if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
    return result;
  }));
});
router.patch("/documents/:id/status", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid document ID" });
  const allowedStatuses = ["Pending", "Verified", "Rejected"];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ message: "Invalid document status" });
  const document = await ExternalDocument.findById(req.params.id).select("-fileData").populate("student", "studentId firstName lastName email");
  if (!document) return res.status(404).json({ message: "Document not found" });
  const statusChanged = document.status !== req.body.status;
  document.status = req.body.status;
  await document.save();
  let notificationQueued = false;
  if (statusChanged || document.lastNotifiedStatus !== document.status) {
    notificationQueued = Boolean(document.notificationEmail || document.student?.email) && areDocumentNotificationsConfigured();
    if (notificationQueued) {
      void sendDocumentStatusNotification(document, document.status, document.notificationEmail || document.student?.email);
    }
  }
  await document.populate("student", "studentId firstName lastName");
  document.fileData = undefined;
  const result = document.toObject();
  if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
  res.json({ ...result, notificationQueued, notificationMessage: notificationQueued ? undefined : "Email was not queued. Check the student's email and server email settings." });
});
router.get("/documents/:id/file", requireDocumentRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid document ID" });
  const document = await ExternalDocument.findById(req.params.id).select("documentTitle submissionDetails name contentType fileData");
  if (!document?.fileData) return res.status(404).json({ message: "File not found" });
  const isLegacyDeclarationJson = document.contentType === "application/json" && /health status declaration/i.test(document.documentTitle || "");
  const fileData = isLegacyDeclarationJson
    ? healthDeclarationToPdf(document.submissionDetails?.healthDeclaration || JSON.parse(document.fileData.toString("utf8")))
    : document.fileData;
  const contentType = isLegacyDeclarationJson ? "application/pdf" : (document.contentType || "application/octet-stream");
  const name = isLegacyDeclarationJson ? document.name.replace(/\.json$/i, ".pdf") : document.name;
  res.type(contentType).attachment(name).send(fileData);
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
