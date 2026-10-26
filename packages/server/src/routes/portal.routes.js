import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import Student from "../models/Student.js";
import QueueEntry from "../models/QueueEntry.js";
import Appointment from "../models/Appointment.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import VitalsLog from "../models/VitalsLog.js";
import ExternalDocument from "../models/ExternalDocument.js";
import MedicalProfile from "../models/MedicalProfile.js";
import MedicalWorkflow from "../models/MedicalWorkflow.js";
import User from "../models/User.js";
import { findClearanceRequirement } from "../services/clearanceRequirements.js";
import { nextQueueNumber } from "../services/queueNumbering.service.js";
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
const requireWorkflowRole = requireRole("nurse", "supervisor", "physician", "dentist");

function pushWorkflowEvent(workflow, type, description, actor) {
  workflow.events.push({ type, description, actor, at: new Date() });
}

function matchesRequiredDocument(requirementText, document) {
  const documentText = [document.documentTitle, document.category, document.name, JSON.stringify(document.submissionDetails || {})].filter(Boolean).join(" ").toLowerCase();
  const required = requirementText.toLowerCase();
  const patterns = [
    [/chest\s*x[\s-]?ray|x[\s-]?ray/, /chest\s*x[\s-]?ray|x[\s-]?ray|radiograph/],
    [/\becg\b|\bekg\b/, /\becg\b|\bekg\b|electrocardiogram/],
    [/\bcbc\b|complete blood count/, /\bcbc\b|complete blood count/],
    [/urinalysis/, /urinalysis|urine\s*(test|analysis)/],
    [/fecalysis|stool/, /fecalysis|stool\s*(test|analysis)|stool\s*exam/],
    [/drug\s*test/, /drug\s*test|drug\s*screen/],
    [/medical certificate/, /medical certificate/],
    [/\bape\b|annual physical exam/, /\bape\b|annual physical exam/],
  ];
  const match = patterns.find(([requirementPattern]) => requirementPattern.test(required));
  return Boolean(match && match[1].test(documentText));
}
function hasCurrentExamDate(requirementText, document) {
  const text = requirementText.toLowerCase();
  const maxMonths = /ecg/.test(text) && /3 months/.test(text) ? 3 : /x[\s-]?ray/.test(text) && /6 months/.test(text) ? 6 : null;
  if (!maxMonths) return true;
  if (!document.examDate) return false;
  const examDate = new Date(document.examDate);
  if (Number.isNaN(examDate.getTime()) || examDate > new Date()) return false;
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - maxMonths);
  return examDate >= earliest;
}
function hasUnresolvedRequirements(workflow) {
  return workflow.requirements.some((item) => (item.required && item.status !== "satisfied") || (item.conditional && !["satisfied", "not_applicable"].includes(item.status)));
}
function isWorkflowManagedPurpose(purpose) {
  return /clearance|consultation/i.test(String(purpose || ""));
}

router.get("/medical-workflows", requireWorkflowRole, async (_req, res) => {
  const workflows = await MedicalWorkflow.find().populate("student", "studentId affiliation firstName lastName department program").populate("queueEntry", "queueNumber status").populate("providerApproval.approvedBy", "name role").sort({ createdAt: -1 }).limit(100);
  res.json(workflows);
});
router.get("/medical-workflows/:id", requireWorkflowRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id).populate("student", "studentId affiliation firstName lastName department program email").populate("queueEntry", "queueNumber status nursingAssessment").populate("medicalProfile").populate("providerApproval.approvedBy", "name role").populate("events.actor", "name role");
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found" });
  res.json(workflow);
});
router.post("/students/:id/medical-workflows", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid patient ID" });
  const { service, purpose, fields = {}, physicalExamIncluded = false, laboratoryExamIncluded = false, requestKey } = req.body || {};
  const idempotencyKey = String(requestKey || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) return res.status(400).json({ message: "A valid request key is required to prevent duplicate records." });
  const priorRequest = await MedicalWorkflow.findOne({ requestKey: idempotencyKey });
  if (priorRequest) {
    if (String(priorRequest.student) !== req.params.id || priorRequest.service !== service || priorRequest.purpose !== String(purpose || "").trim()) return res.status(409).json({ message: "This request key has already been used for a different medical record." });
    return res.status(200).json(await priorRequest.populate("student", "studentId affiliation firstName lastName").populate("queueEntry", "queueNumber status"));
  }
  if (!["Medical Consultation", "Dental Consultation", "Medical Clearance"].includes(service)) return res.status(400).json({ message: "Choose a supported clinical service." });
  if (typeof purpose !== "string" || !purpose.trim()) return res.status(400).json({ message: "Visit purpose is required." });
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return res.status(400).json({ message: "Record fields must be an object." });
  const student = await Student.findById(req.params.id);
  if (!student || !student.isActive) return res.status(404).json({ message: "Active patient not found." });
  let requirementSet = null;
  if (service === "Medical Clearance") {
    requirementSet = findClearanceRequirement(student.affiliation, purpose);
    if (!requirementSet) return res.status(400).json({ message: "That clearance purpose is not valid for this patient's affiliation." });
  }
  const workflow = new MedicalWorkflow({
    student: student._id, requestKey: idempotencyKey, service, purpose: purpose.trim(), affiliation: student.affiliation,
    initialFields: fields, physicalExamIncluded: Boolean(physicalExamIncluded), laboratoryExamIncluded: Boolean(laboratoryExamIncluded),
    status: service === "Medical Clearance" ? "assessment" : "queued",
    requirements: (requirementSet?.requirements || []).map((item) => ({ text: item.text, kind: item.kind, required: item.conditional ? false : Boolean(item.required || item.kind === "action"), conditional: Boolean(item.conditional), condition: item.condition || "" })),
    events: [{ type: "created", description: `New ${service.toLowerCase()} workflow started from the staff medical record.`, actor: req.user.id, at: new Date() }],
  });
  if (service !== "Medical Clearance") {
    const queueEntry = await QueueEntry.create({ student: student._id, medicalWorkflow: workflow._id, queueNumber: await nextQueueNumber(service), priorityLevel: "Standard Priority", serviceType: service, reason: "Staff-created medical record", requestDetails: purpose.trim(), status: "waiting" });
    workflow.queueEntry = queueEntry._id;
    pushWorkflowEvent(workflow, "queued", `Added to the ${service.toLowerCase()} clinical queue (${queueEntry.queueNumber}).`, req.user.id);
  }
  try {
    await workflow.save();
  } catch (saveError) {
    if (saveError?.code !== 11000) throw saveError;
    if (workflow.queueEntry) await QueueEntry.deleteOne({ _id: workflow.queueEntry });
    const existing = await MedicalWorkflow.findOne({ requestKey: idempotencyKey });
    if (!existing) throw saveError;
    return res.status(200).json(await existing.populate("student", "studentId affiliation firstName lastName").populate("queueEntry", "queueNumber status"));
  }
  const io = req.app.get("io");
  if (workflow.queueEntry) {
    const queueEntry = await QueueEntry.findById(workflow.queueEntry).populate("student").populate("medicalWorkflow", "purpose initialFields physicalExamIncluded laboratoryExamIncluded");
    io?.to("clinical-queue").emit("queue:update", queueEntry);
    io?.to("frontdesk-queue").emit("queue:update", { _id: queueEntry._id, status: queueEntry.status, queueNumber: queueEntry.queueNumber });
  }
  res.status(201).json(await MedicalWorkflow.findById(workflow._id).populate("student", "studentId affiliation firstName lastName").populate("queueEntry", "queueNumber status"));
});
router.post("/medical-workflows/:id/assessment", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id);
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  if (workflow.service !== "Medical Clearance" || !["assessment", "requirements_pending", "ready_for_approval"].includes(workflow.status)) return res.status(409).json({ message: "This workflow is not accepting nursing clearance assessments." });
  const assessment = req.body?.assessment || {};
  const allowed = ["physicalExam", "laboratoryExamination", "notes"];
  const nextAssessment = Object.fromEntries(allowed.map((key) => [key, String(assessment[key] || "").trim().slice(0, 4000)]));
  if (!nextAssessment.physicalExam && !nextAssessment.laboratoryExamination) return res.status(400).json({ message: "Record a physical or laboratory examination before advancing the clearance." });
  workflow.assessment = { ...nextAssessment, recordedBy: req.user.id, recordedAt: new Date() };
  const missing = hasUnresolvedRequirements(workflow);
  workflow.status = missing ? "requirements_pending" : "ready_for_approval";
  pushWorkflowEvent(workflow, "assessment", "Nursing clearance assessment saved.", req.user.id);
  await workflow.save();
  res.json(await workflow.populate("student", "studentId affiliation firstName lastName"));
});
router.patch("/medical-workflows/:id/requirements/:index", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ message: "Invalid requirement index" });
  const workflow = await MedicalWorkflow.findById(req.params.id);
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  const requirement = workflow.requirements[index];
  if (!requirement) return res.status(404).json({ message: "Requirement not found." });
  if (["approval_in_progress", "approved", "completed"].includes(workflow.status)) return res.status(409).json({ message: "This workflow is locked while approval is in progress or after approval." });
  const status = req.body?.status;
  if (!["satisfied", "not_applicable", "pending"].includes(status)) return res.status(400).json({ message: "Invalid requirement status." });
  let evidence = String(req.body?.evidence || "").trim().slice(0, 500);
  if (requirement.kind === "action" && status === "satisfied" && !evidence) return res.status(400).json({ message: "Enter a brief note describing how this action was completed." });
  if (requirement.kind === "document" && status === "satisfied") {
    if (!validId(req.body?.documentId)) return res.status(400).json({ message: "Select a verified patient document to satisfy this requirement." });
    const document = await ExternalDocument.findOne({ _id: req.body.documentId, student: workflow.student, status: "Verified" }).select("documentTitle category name submissionDetails examDate");
    if (!document) return res.status(400).json({ message: "Only a verified document belonging to this patient can satisfy this requirement." });
    if (!matchesRequiredDocument(requirement.text, document)) return res.status(400).json({ message: "The verified document type does not match this clearance requirement." });
    if (!hasCurrentExamDate(requirement.text, document)) return res.status(400).json({ message: "The exam or issue date is missing, in the future, or outside the validity period for this requirement." });
    evidence = [document.documentTitle, document.category, document.name].filter(Boolean).join(" — ");
  }
  if (requirement.kind === "action" && status === "satisfied" && /dental exam|dental examination/i.test(requirement.text)) {
    if (/physical/i.test(requirement.text) && !workflow.assessment?.physicalExam?.trim()) return res.status(409).json({ message: "Record the physical examination before completing this medical and dental requirement." });
    const dentalEncounter = await ConsultationRecord.findOne({ student: workflow.student, visitType: "Dental Consultation", visitDate: { $gte: workflow.createdAt } }).select("_id");
    if (!dentalEncounter) return res.status(409).json({ message: "Complete the patient's dentist consultation before marking the dental examination requirement complete." });
    evidence = `Dental encounter ${dentalEncounter._id} · ${evidence}`;
  }
  if (status === "not_applicable" && (!requirement.conditional || requirement.required)) return res.status(400).json({ message: "Only conditional items can be marked not applicable." });
  if (status === "not_applicable" && !evidence) return res.status(400).json({ message: "Record why this conditional requirement does not apply." });
  requirement.status = status;
  requirement.verifiedBy = req.user.id;
  requirement.verifiedAt = new Date();
  requirement.evidence = evidence;
  const missing = hasUnresolvedRequirements(workflow);
  const hasAssessment = Boolean(workflow.assessment?.physicalExam || workflow.assessment?.laboratoryExamination || workflow.assessment?.notes);
  workflow.status = !hasAssessment ? "assessment" : missing ? "requirements_pending" : "ready_for_approval";
  pushWorkflowEvent(workflow, "requirement", `${requirement.text}: ${status.replaceAll("_", " ")}.`, req.user.id);
  await workflow.save();
  res.json(workflow);
});
router.post("/medical-workflows/:id/approve", requireRole("physician"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id);
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  if (workflow.service !== "Medical Clearance") return res.status(403).json({ message: "Only medical clearance can issue a clearance certificate." });
  const resumingApproval = workflow.status === "approval_in_progress" && String(workflow.providerApproval?.approvedBy) === String(req.user.id);
  if ((!resumingApproval && workflow.status !== "ready_for_approval") || hasUnresolvedRequirements(workflow) || !workflow.assessment?.recordedAt) return res.status(409).json({ message: "Complete the required assessments and verify every required item or record why a conditional item does not apply." });
  const providerStatement = (resumingApproval ? workflow.providerStatement : String(req.body?.providerStatement || "").trim()).slice(0, 2000);
  if (providerStatement.length < 10) return res.status(400).json({ message: "Enter the provider's clearance assessment before approval." });
  const provider = await User.findById(req.user.id).select("name role");
  if (!provider) return res.status(401).json({ message: "Authorized provider account not found." });
  if (!resumingApproval) {
    const claimed = await MedicalWorkflow.findOneAndUpdate(
      { _id: workflow._id, status: "ready_for_approval" },
      { $set: { status: "approval_in_progress", providerStatement, providerApproval: { approvedBy: provider._id, providerName: provider.name, providerRole: provider.role } } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "This clearance is already being approved or has changed." });
  }
  let profile = await MedicalProfile.findOne({ "fields.medicalWorkflowId": workflow._id });
  const approvalDate = profile?.fields?.approvedAt ? new Date(profile.fields.approvedAt) : new Date();
  try {
    if (!profile) {
      const student = await Student.findById(workflow.student).select("studentId");
      if (!student) throw new Error("Patient record no longer exists.");
      profile = await MedicalProfile.create({
        student: workflow.student, studentId: student.studentId,
        purpose: `Medical Clearance — ${workflow.purpose}`, provider: provider.name,
        physicalExamIncluded: workflow.physicalExamIncluded, laboratoryExamIncluded: workflow.laboratoryExamIncluded,
        fields: {
          ...workflow.initialFields,
          medicalWorkflowId: workflow._id,
          clearancePurpose: workflow.purpose,
          clearanceAssessment: workflow.assessment,
          requirementChecks: workflow.requirements.map((item) => ({ text: item.text, status: item.status, evidence: item.evidence })),
          providerStatement,
          providerRole: provider.role,
          approvedAt: approvalDate,
        },
        examinedAt: approvalDate,
      });
    }
  } catch (error) {
    throw error;
  }
  const approved = await MedicalWorkflow.findOneAndUpdate(
    { _id: workflow._id, status: "approval_in_progress", "providerApproval.approvedBy": provider._id },
    { $set: { status: "approved", medicalProfile: profile._id, "providerApproval.approvedAt": approvalDate, certificateIssuedAt: approvalDate, certificateIssuedBy: provider._id }, $push: { events: { type: "approved", description: `Medical clearance approved by ${provider.name}; certificate issued.`, actor: provider._id, at: approvalDate } } },
    { new: true }
  );
  if (!approved) return res.status(409).json({ message: "The clearance approval state changed. Refresh and review the workflow." });
  res.json(await approved.populate("student", "studentId affiliation firstName lastName department program").populate("providerApproval.approvedBy", "name role").populate("medicalProfile"));
});
router.get("/medical-workflows/:id/certificate", requireWorkflowRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id).populate("student", "studentId affiliation firstName lastName department program").populate("providerApproval.approvedBy", "name role");
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  if (workflow.service !== "Medical Clearance" || workflow.status !== "approved" || !workflow.certificateIssuedAt || !workflow.providerApproval?.approvedBy || !workflow.medicalProfile) return res.status(409).json({ message: "The certificate is unavailable until the record is saved and an authorized provider approves the completed clearance." });
  res.json({ workflowId: workflow._id, purpose: workflow.purpose, issueDate: workflow.certificateIssuedAt, patient: workflow.student, provider: workflow.providerApproval, providerStatement: workflow.providerStatement });
});

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
  const role = String(req.user.role || "").toLowerCase();
  const isConsultation = ["Medical Consultation", "Dental Consultation"].includes(queueEntry.serviceType);
  if (isConsultation) {
    if (!(["physician", "doctor", "dentist"].includes(role)) || queueEntry.status !== "provider_in_session") {
      return res.status(409).json({ message: "A physician or dentist must start this consultation before completing it." });
    }
    if ((role === "dentist" && queueEntry.serviceType !== "Dental Consultation") || (role !== "dentist" && queueEntry.serviceType === "Dental Consultation")) {
      return res.status(403).json({ message: "This consultation must be completed by the matching physician or dentist." });
    }
  } else if (!(["nurse", "supervisor"].includes(role)) || queueEntry.status !== "in_session") {
    return res.status(409).json({ message: "A nurse or supervisor must start this service before completing it." });
  }
  const allowed = ["Walk-in Medical Consultation", "Dental Consultation", "Medication and Relief", "General Inquiry"];
  if (!allowed.includes(visitType)) return res.status(400).json({ message: "Invalid visit type" });
  if (isConsultation && (!String(req.body.assessment || "").trim() || !String(req.body.plan || "").trim())) {
    return res.status(400).json({ message: "Record a diagnosis/clinical assessment and treatment plan before completing this consultation." });
  }
  const fields = ["bloodPressure", "pulseRate", "spo2"];
  const hasVitals = fields.some((field) => secondaryVitals[field] !== undefined && secondaryVitals[field] !== "");
  if (hasVitals) await VitalsLog.create({ student: queueEntry.student._id, source: "manual_staff_entry", ...secondaryVitals });
  const { queueEntryId: _id, secondaryVitals: _vitals, ...recordFields } = req.body;
  const consultation = await ConsultationRecord.findOneAndUpdate(
    { queueEntry: queueEntry._id },
    { $setOnInsert: {
      ...recordFields, student: queueEntry.student._id, queueEntry: queueEntry._id,
      attendingStaff: req.user.id, visitType,
      vitalsSnapshot: { ...(queueEntry.linkedVitals?.toObject?.() || {}), ...secondaryVitals },
    } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  queueEntry.status = "completed";
  queueEntry.completedAt = new Date();
  await queueEntry.save();
  const workflow = await MedicalWorkflow.findOne({ queueEntry: queueEntry._id });
  if (workflow) {
    const attendingProvider = await User.findById(req.user.id).select("name");
    const medicalProfile = await MedicalProfile.findOneAndUpdate(
      { "fields.consultationRecordId": consultation._id },
      { $setOnInsert: {
        student: queueEntry.student._id,
        studentId: queueEntry.student.studentId,
        purpose: workflow.service,
        provider: attendingProvider?.name || "",
        physicalExamIncluded: workflow.physicalExamIncluded,
        laboratoryExamIncluded: workflow.laboratoryExamIncluded,
        fields: {
          ...workflow.initialFields,
          diagnosis: String(req.body.assessment || "").trim(),
          treatment: String(req.body.plan || "").trim(),
          nursingAssessment: {
            physicalExam: queueEntry.nursingAssessment?.physicalExam || "",
            laboratoryExamination: queueEntry.nursingAssessment?.laboratoryExamination || "",
            notes: queueEntry.nursingAssessment?.notes || "",
            recordedAt: queueEntry.nursingAssessment?.recordedAt || null,
          },
          consultationRecordId: consultation._id,
        },
        examinedAt: new Date(),
      } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    workflow.status = "completed";
    workflow.medicalProfile = medicalProfile._id;
    workflow.diagnosis = String(req.body.assessment || "").trim();
    workflow.treatment = String(req.body.plan || "").trim();
    pushWorkflowEvent(workflow, "completed", `${queueEntry.serviceType} assessment and provider consultation completed.`, req.user.id);
    await workflow.save();
  }
  if (queueEntry.appointment) {
    const completedAppointment = await Appointment.findOneAndUpdate(
      { _id: queueEntry.appointment, queueEntry: queueEntry._id, status: "checked_in" },
      { $set: { status: "completed" } },
      { new: true }
    ).select("_id status");
    if (completedAppointment) {
      req.app.get("io")?.emit("appointment:update", { _id: completedAppointment._id, status: completedAppointment.status, queueEntry: queueEntry._id });
    }
  }
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
  if (isWorkflowManagedPurpose(req.body?.purpose)) return res.status(409).json({ message: "Consultation and medical-clearance profiles are written only after their linked clinical workflow is completed and approved." });
  const profile = await MedicalProfile.create({ ...req.body, student: student._id, studentId: student.studentId });
  res.status(201).json(profile);
});
router.put("/medical-profiles/:id", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid medical profile ID" });
  const fields = req.body?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return res.status(400).json({ message: "Medical profile fields are required" });
  const existing = await MedicalProfile.findById(req.params.id).select("purpose fields.consultationRecordId fields.medicalWorkflowId");
  if (!existing) return res.status(404).json({ message: "Medical profile not found" });
  if (existing.fields?.consultationRecordId || existing.fields?.medicalWorkflowId) return res.status(409).json({ message: "This workflow-managed clinical record is locked after provider completion or clearance approval." });
  if (typeof req.body.purpose === "string" && isWorkflowManagedPurpose(req.body.purpose)) return res.status(409).json({ message: "Consultation and clearance purposes must be managed through their clinical workflow." });
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
  const { title, category, examDate, name, contentType, fileData } = req.body;
  const notificationEmail = String(req.body.notificationEmail || student.email || "").trim().toLowerCase();
  if (!title || !name || !fileData) return res.status(400).json({ message: "Title and file are required" });
  const parsedExamDate = examDate ? new Date(examDate) : null;
  if (!parsedExamDate || Number.isNaN(parsedExamDate.getTime()) || parsedExamDate > new Date()) return res.status(400).json({ message: "Enter a valid examination, test, or issue date that is not in the future." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) return res.status(400).json({ message: "Enter a valid student email address to send the submission notice." });
  const bytes = Buffer.from(fileData, "base64");
  if (bytes.length > 12 * 1024 * 1024) return res.status(413).json({ message: "File exceeds the 12 MB limit" });
  const document = await ExternalDocument.create({
    student: student._id, documentTitle: title, category, name, contentType,
    fileData: bytes, formSource: "Admin Portal", status: "Pending", notificationEmail, examDate: parsedExamDate, submittedAt: new Date(),
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
  if (["Verified", "Rejected"].includes(document.status)) {
    return res.status(409).json({ message: "This document has already been decided and its status cannot be changed." });
  }
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
