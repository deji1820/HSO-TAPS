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
import { createMedicalClearanceWorkflow } from "../services/medicalClearanceWorkflow.js";
import { providerRoleMatches } from "../services/providerAvailability.js";
import { clearancePurposeFor, issueVerifiedClearanceDocument } from "../services/clearanceCertificate.service.js";
import { nextQueueNumber } from "../services/queueNumbering.service.js";
import PatientHistory from "../models/PatientHistory.js";
import Announcement from "../models/Announcement.js";
import MedicineInventory from "../models/MedicineInventory.js";
import { healthDeclarationToPdf } from "../services/healthDeclarationPdf.js";
import { areDocumentNotificationsConfigured, sendDocumentStatusNotification } from "../services/documentNotifications.service.js";
import { applyDeclarationToPatient, declarationRequiresReview, materialDeclarationChanges, normalizeDeclaration, validateDeclaration } from "../services/patientInformation.js";

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
  return /consultation/i.test(String(purpose || ""));
}
function isHealthDeclarationDocument(document) {
  return document?.recordType === "health_declaration" || (Boolean(document?.submissionDetails?.healthDeclaration) && /health status declaration/i.test(document?.documentTitle || ""));
}

router.post("/students/:id/medical-workflows", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid patient ID" });
  const { service, purpose, fields = {}, physicalExamIncluded = false, laboratoryExamIncluded = false, requestKey } = req.body || {};
  const idempotencyKey = String(requestKey || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) return res.status(400).json({ message: "A valid request key is required to prevent duplicate records." });
  const priorRequest = await MedicalWorkflow.findOne({ requestKey: idempotencyKey }).select("+documentSubmissionToken");
  if (priorRequest) {
    if (String(priorRequest.student) !== req.params.id || priorRequest.service !== service || priorRequest.purpose !== String(purpose || "").trim()) return res.status(409).json({ message: "This request key has already been used for a different medical record." });
    return res.status(200).json(await priorRequest.populate("student", "studentId affiliation firstName lastName").populate("queueEntry", "queueNumber status"));
  }
  if (!["Medical Consultation", "Dental Consultation", "Medical Clearance"].includes(service)) return res.status(400).json({ message: "Choose a supported clinical service." });
  if (typeof purpose !== "string" || !purpose.trim()) return res.status(400).json({ message: "Visit purpose is required." });
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return res.status(400).json({ message: "Record fields must be an object." });
  if (service === "Medical Clearance" && String(req.user.role).toLowerCase() !== "nurse") return res.status(403).json({ message: "Only a nurse can create a staff medical-clearance workflow." });
  const student = await Student.findById(req.params.id);
  if (!student || !student.isActive) return res.status(404).json({ message: "Active patient not found." });
  if (service === "Medical Clearance" && !findClearanceRequirement(student.affiliation, purpose)) return res.status(400).json({ message: "That clearance purpose is not valid for this patient's affiliation." });
  const workflow = service === "Medical Clearance"
    ? createMedicalClearanceWorkflow({ student, purpose, requestKey: idempotencyKey, fields, physicalExamIncluded, laboratoryExamIncluded, actor: req.user.id })
    : new MedicalWorkflow({ student: student._id, requestKey: idempotencyKey, service, purpose: purpose.trim(), affiliation: student.affiliation, initialFields: fields, physicalExamIncluded: Boolean(physicalExamIncluded), laboratoryExamIncluded: Boolean(laboratoryExamIncluded), status: "queued", events: [{ type: "created", description: `New ${service.toLowerCase()} workflow started from the staff medical record.`, actor: req.user.id, at: new Date() }] });
  const queueEntry = await QueueEntry.create({ student: student._id, medicalWorkflow: workflow._id, queueNumber: await nextQueueNumber(service), priorityLevel: "Standard Priority", serviceType: service, reason: "Staff-created medical record", requestDetails: purpose.trim(), status: "waiting" });
  workflow.queueEntry = queueEntry._id;
  pushWorkflowEvent(workflow, "queued", `Added to the ${service.toLowerCase()} clinical queue (${queueEntry.queueNumber}).`, req.user.id);
  try {
    await workflow.save();
  } catch (saveError) {
    if (saveError?.code !== 11000) throw saveError;
    if (workflow.queueEntry) await QueueEntry.deleteOne({ _id: workflow.queueEntry });
    const existing = await MedicalWorkflow.findOne({ requestKey: idempotencyKey }).select("+documentSubmissionToken");
    if (!existing) throw saveError;
    return res.status(200).json(await existing.populate("student", "studentId affiliation firstName lastName").populate("queueEntry", "queueNumber status"));
  }
  const io = req.app.get("io");
  if (workflow.queueEntry) {
    const populatedQueueEntry = await QueueEntry.findById(workflow.queueEntry).populate("student").populate("medicalWorkflow");
    io?.to("clinical-queue").emit("queue:update", populatedQueueEntry);
    io?.to("frontdesk-queue").emit("queue:update", { _id: populatedQueueEntry._id, status: populatedQueueEntry.status, queueNumber: populatedQueueEntry.queueNumber });
  }
  res.status(201).json(await MedicalWorkflow.findById(workflow._id).select("+documentSubmissionToken").populate("student", "studentId affiliation firstName lastName").populate("queueEntry", "queueNumber status"));
});
router.post("/medical-workflows/:id/assessment", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id);
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  if (workflow.service === "Medical Clearance" && String(req.user.role).toLowerCase() !== "nurse") return res.status(403).json({ message: "Only a nurse can assess a medical clearance." });
  if (workflow.service !== "Medical Clearance" || !["assessment", "requirements_pending", "ready_for_approval"].includes(workflow.status)) return res.status(409).json({ message: "This workflow is not accepting nursing clearance assessments." });
  if (workflow.queueEntry && await QueueEntry.exists({ _id: workflow.queueEntry, status: "completed" })) return res.status(409).json({ message: "This completed clearance can no longer be edited." });
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
  if (workflow.service === "Medical Clearance" && String(req.user.role).toLowerCase() !== "nurse") return res.status(403).json({ message: "Only a nurse can verify clearance requirements." });
  if (workflow.queueEntry && await QueueEntry.exists({ _id: workflow.queueEntry, status: "completed" })) return res.status(409).json({ message: "This completed clearance can no longer be edited." });
  const requirement = workflow.requirements[index];
  if (!requirement) return res.status(404).json({ message: "Requirement not found." });
  if (["approval_in_progress", "approved", "completed"].includes(workflow.status)) return res.status(409).json({ message: "This workflow is locked while approval is in progress or after approval." });
  const status = req.body?.status;
  if (!["satisfied", "not_applicable", "pending"].includes(status)) return res.status(400).json({ message: "Invalid requirement status." });
  let evidence = String(req.body?.evidence || "").trim().slice(0, 500);
  if (requirement.kind === "action" && status === "satisfied" && !evidence) return res.status(400).json({ message: "Enter a brief note describing how this action was completed." });
  if (requirement.kind === "document" && status === "satisfied") {
    if (!validId(req.body?.documentId)) return res.status(400).json({ message: "Select a verified patient document to satisfy this requirement." });
    const document = await ExternalDocument.findOne({ _id: req.body.documentId, student: workflow.student, status: "Verified", $or: [{ clearanceWorkflow: { $exists: false } }, { clearanceWorkflow: workflow._id }] }).select("documentTitle category name submissionDetails examDate clearanceWorkflow clearanceRequirementText");
    if (!document) return res.status(400).json({ message: "Only a verified document belonging to this patient can satisfy this requirement." });
    if (document.clearanceWorkflow && document.clearanceRequirementText !== requirement.text) return res.status(400).json({ message: "This document was submitted for a different clearance requirement." });
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
  requirement.document = requirement.kind === "document" && status === "satisfied" ? req.body.documentId : undefined;
  const missing = hasUnresolvedRequirements(workflow);
  const hasAssessment = Boolean(workflow.assessment?.physicalExam || workflow.assessment?.laboratoryExamination || workflow.assessment?.notes);
  workflow.status = !hasAssessment ? "assessment" : missing ? "requirements_pending" : "ready_for_approval";
  pushWorkflowEvent(workflow, "requirement", `${requirement.text}: ${status.replaceAll("_", " ")}.`, req.user.id);
  await workflow.save();
  res.json(workflow);
});
router.post("/medical-workflows/:id/approve", requireRole("nurse"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id);
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  if (workflow.service !== "Medical Clearance") return res.status(403).json({ message: "Only medical clearance can issue a clearance certificate." });
  const resumingApproval = workflow.status === "approval_in_progress" && String(workflow.providerApproval?.approvedBy) === String(req.user.id);
  if ((!resumingApproval && workflow.status !== "ready_for_approval") || hasUnresolvedRequirements(workflow) || !workflow.assessment?.recordedAt) return res.status(409).json({ message: "Complete the required assessments and verify every required item or record why a conditional item does not apply." });
  const providerStatement = (resumingApproval ? workflow.providerStatement : String(req.body?.providerStatement || "").trim()).slice(0, 2000);
  if (providerStatement.length < 10) return res.status(400).json({ message: "Enter the provider's clearance assessment before approval." });
  const provider = await User.findById(req.user.id).select("name role");
  if (!provider || provider.role !== "nurse") return res.status(401).json({ message: "Authorized nurse account not found." });
  if (!resumingApproval) {
    const claimed = await MedicalWorkflow.findOneAndUpdate(
      { _id: workflow._id, status: "ready_for_approval" },
      { $set: { status: "approval_in_progress", providerStatement, providerApproval: { approvedBy: provider._id, providerName: provider.name, providerRole: provider.role } } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "This clearance is already being approved or has changed." });
  }
  const existingCertificate = await ExternalDocument.findOne({ sourceWorkflow: workflow._id }).select("_id submittedAt");
  const approvalDate = existingCertificate?.submittedAt || workflow.certificateIssuedAt || new Date();
  const student = await Student.findById(workflow.student).select("studentId affiliation firstName lastName program department");
  if (!student) return res.status(409).json({ message: "Patient record no longer exists; the clearance cannot be saved to Medical Files." });
  const certificate = await ExternalDocument.findOneAndUpdate(
    { sourceWorkflow: workflow._id },
    { $setOnInsert: {
      student: student._id,
      recordType: "clearance_certificate",
      sourceWorkflow: workflow._id,
      documentTitle: `Medical Clearance Certificate — ${workflow.purpose}`,
      formSource: "HSO Clearance Workflow",
      category: "Medical Clearance Certificate",
      status: "Issued",
      submittedAt: approvalDate,
      verificationHistory: [{ status: "Issued", remarks: "Issued after nurse assessment and completion of required document verification.", actor: provider._id, at: approvalDate }],
      verifiedBy: provider._id,
      verifiedAt: approvalDate,
      submissionDetails: {
        clearance: {
          workflowId: workflow._id,
          purpose: workflow.purpose,
          patient: { studentId: student.studentId, affiliation: student.affiliation, name: `${student.firstName} ${student.lastName}`, program: student.program, department: student.department },
          assessment: workflow.assessment,
          requirements: workflow.requirements.map((item) => ({ text: item.text, kind: item.kind, status: item.status, evidence: item.evidence, verifiedAt: item.verifiedAt, verifiedBy: item.verifiedBy })),
          approval: { providerName: provider.name, providerRole: provider.role, providerId: provider._id, providerStatement, approvedAt: approvalDate },
          certificateReference: String(workflow._id),
        },
      },
    } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (!certificate) return res.status(500).json({ message: "The clearance certificate could not be saved to Medical Files. The workflow remains incomplete." });
  const approved = await MedicalWorkflow.findOneAndUpdate(
    { _id: workflow._id, status: "approval_in_progress", "providerApproval.approvedBy": provider._id },
    { $set: { status: "approved", medicalFile: certificate._id, "providerApproval.approvedAt": approvalDate, certificateIssuedAt: approvalDate, certificateIssuedBy: provider._id }, $push: { events: { type: "approved", description: `Medical clearance verified by nurse ${provider.name}; certificate saved to Full EMR Medical Files.`, actor: provider._id, at: approvalDate } } },
    { new: true }
  );
  if (!approved) return res.status(409).json({ message: "The certificate was saved, but the approval state changed. Refresh and resume approval to finish the workflow." });
  let queueCompletionWarning;
  if (approved.queueEntry) {
    const linkedQueue = await QueueEntry.findById(approved.queueEntry).select("status appointment");
    if (linkedQueue && ["waiting", "called", "in_session", "awaiting_provider", "provider_in_session"].includes(linkedQueue.status)) {
      const completedAt = new Date();
      const completedQueue = await QueueEntry.findOneAndUpdate(
        { _id: linkedQueue._id, status: linkedQueue.status },
        { $set: { status: "completed", completedAt }, $push: { statusHistory: { from: linkedQueue.status, to: "completed", actor: req.user.id, at: completedAt, reason: "Nurse completed the clearance and saved its certificate to Medical Files." } } },
        { new: true },
      );
      if (completedQueue) {
        req.app.get("io")?.to("clinical-queue").emit("queue:update", { _id: completedQueue._id, status: completedQueue.status, completedAt });
        req.app.get("io")?.to("frontdesk-queue").emit("queue:update", { _id: completedQueue._id, status: completedQueue.status, completedAt });
        if (linkedQueue.appointment) {
          const completedAppointment = await Appointment.findOneAndUpdate(
            { _id: linkedQueue.appointment, queueEntry: completedQueue._id, status: "checked_in" },
            { $set: { status: "completed" } },
            { new: true },
          ).select("_id status");
          if (completedAppointment) req.app.get("io")?.emit("appointment:update", { _id: completedAppointment._id, status: completedAppointment.status, queueEntry: completedQueue._id });
        }
      } else queueCompletionWarning = "The clearance was saved and approved, but its queue entry changed. Please refresh the queue.";
    }
  }
  const result = await approved.populate("student", "studentId affiliation firstName lastName department program").populate("providerApproval.approvedBy", "name role").populate("medicalFile");
  if (queueCompletionWarning) return res.status(200).json({ ...result.toObject(), queueCompletionWarning });
  res.json(result);
});
router.get("/medical-workflows/:id/certificate", requireWorkflowRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid workflow ID" });
  const workflow = await MedicalWorkflow.findById(req.params.id).populate("student", "studentId affiliation firstName lastName department program").populate("providerApproval.approvedBy", "name role");
  if (!workflow) return res.status(404).json({ message: "Medical workflow not found." });
  if (workflow.service !== "Medical Clearance" || workflow.status !== "approved" || !workflow.certificateIssuedAt || !workflow.providerApproval?.approvedBy || !(workflow.medicalFile || workflow.medicalProfile)) return res.status(409).json({ message: "The certificate is unavailable until it is saved to the patient's EMR and an authorized provider approves the completed clearance." });
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

router.patch("/consultations/:queueEntryId/draft", requireRole("physician", "doctor", "dentist"), async (req, res) => {
  const { queueEntryId } = req.params;
  if (!validId(queueEntryId)) return res.status(400).json({ message: "Invalid queue entry ID." });
  const queueEntry = await QueueEntry.findById(queueEntryId).populate("student").populate("linkedVitals").populate("medicalWorkflow");
  if (!queueEntry) return res.status(404).json({ message: "Queue entry not found." });
  if (!["Medical Consultation", "Dental Consultation"].includes(queueEntry.serviceType) || queueEntry.status !== "provider_in_session") return res.status(409).json({ message: "Only an active physician or dentist consultation can be saved as a draft." });
  const role = String(req.user.role || "").toLowerCase();
  if (!providerRoleMatches(queueEntry.serviceType, role)) return res.status(403).json({ message: "This consultation is assigned to the matching physician or dentist queue." });

  const intakeFields = req.body?.intakeFields || {};
  if (!intakeFields || typeof intakeFields !== "object" || Array.isArray(intakeFields) || JSON.stringify(intakeFields).length > 20000) return res.status(400).json({ message: "Medical record intake fields are invalid or too large." });
  const nursingAssessmentInput = req.body?.nursingAssessment || {};
  const nursingAssessment = Object.fromEntries(["physicalExam", "laboratoryExamination", "notes"].map((key) => [key, String(nursingAssessmentInput[key] || "").trim().slice(0, 4000)]));
  nursingAssessment.physicalExamIncluded = Boolean(nursingAssessmentInput.physicalExamIncluded);
  nursingAssessment.laboratoryExamIncluded = Boolean(nursingAssessmentInput.laboratoryExamIncluded);
  nursingAssessment.fields = nursingAssessmentInput.fields && typeof nursingAssessmentInput.fields === "object" && !Array.isArray(nursingAssessmentInput.fields)
    ? Object.fromEntries(Object.entries(nursingAssessmentInput.fields).slice(0, 40).map(([key, value]) => [String(key).slice(0, 80), String(value ?? "").trim().slice(0, 2000)]))
    : {};
  nursingAssessment.recordedBy = queueEntry.nursingAssessment?.recordedBy || req.user.id;
  nursingAssessment.recordedAt = queueEntry.nursingAssessment?.recordedAt || new Date();
  const secondaryVitals = req.body?.secondaryVitals || {};
  const pulseRate = secondaryVitals.pulseRate === "" || secondaryVitals.pulseRate == null ? null : Number(secondaryVitals.pulseRate);
  const spo2 = secondaryVitals.spo2 === "" || secondaryVitals.spo2 == null ? null : Number(secondaryVitals.spo2);
  if ((pulseRate !== null && (!Number.isFinite(pulseRate) || pulseRate < 0 || pulseRate > 300)) || (spo2 !== null && (!Number.isFinite(spo2) || spo2 < 0 || spo2 > 100))) return res.status(400).json({ message: "Enter valid pulse and oxygen saturation measurements." });
  const bp = String(secondaryVitals.bloodPressure || "").trim().slice(0, 30);
  const vitalsSnapshot = {
    ...(queueEntry.linkedVitals?.toObject?.() || {}),
    bloodPressure: bp,
    pulseRate,
    spo2,
  };
  const text = (key, max = 4000) => String(req.body?.[key] || "").trim().slice(0, max);
  const visitType = queueEntry.serviceType === "Dental Consultation" ? "Dental Consultation" : "Walk-in Medical Consultation";
  const now = new Date();
  const consultation = await ConsultationRecord.findOneAndUpdate(
    { queueEntry: queueEntry._id },
    { $set: {
      student: queueEntry.student._id,
      queueEntry: queueEntry._id,
      serviceType: queueEntry.serviceType,
      requestDetails: queueEntry.requestDetails || "",
      attendingStaff: req.user.id,
      visitType,
      status: "in_progress",
      subjective: text("subjective"),
      objective: text("objective"),
      assessment: text("assessment"),
      plan: text("plan"),
      otc: { itemDispensed: text("medicineName", 300), quantity: text("quantity", 100), instructions: text("otcInstructions", 1000) },
      firstAid: { careProvided: text("careProvided", 1000), appliedTo: text("appliedTo", 500), restRequired: text("restRequired", 300) },
      safetyChecklist: {
        verifiedIdentityAndAllergies: Boolean(req.body?.safetyChecklist?.verifiedIdentityAndAllergies),
        confirmedNoAdverseReactions: Boolean(req.body?.safetyChecklist?.confirmedNoAdverseReactions),
        instructedDosageAndHygiene: Boolean(req.body?.safetyChecklist?.instructedDosageAndHygiene),
      },
      sessionNotes: text("sessionNotes"),
      natureOfInquiry: text("natureOfInquiry"),
      inquiryResponse: text("inquiryResponse"),
      vitalsSnapshot,
    } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const linkedVitals = await VitalsLog.findOneAndUpdate(
    { queueEntry: queueEntry._id },
    { $set: { bloodPressure: bp, pulseRate, spo2, source: "manual_staff_entry", capturedAt: now }, $setOnInsert: { student: queueEntry.student._id, queueEntry: queueEntry._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const savedQueueEntry = await QueueEntry.findOneAndUpdate(
    { _id: queueEntry._id, status: "provider_in_session" },
    { $set: { nursingAssessment } },
    { new: true, runValidators: true },
  ).populate("student").populate("linkedVitals").populate("medicalWorkflow", "purpose initialFields physicalExamIncluded laboratoryExamIncluded").populate("consultationRecord");
  if (!savedQueueEntry) return res.status(409).json({ message: "The session changed while saving. Reload it before editing further." });
  if (queueEntry.medicalWorkflow) {
    queueEntry.medicalWorkflow.initialFields = intakeFields;
    queueEntry.medicalWorkflow.diagnosis = text("assessment");
    queueEntry.medicalWorkflow.treatment = text("plan");
    await queueEntry.medicalWorkflow.save();
  }
  const profileFields = {
    ...(queueEntry.medicalWorkflow?.initialFields || {}),
    ...intakeFields,
    diagnosis: text("assessment"),
    treatment: text("plan"),
    serviceType: queueEntry.serviceType,
    requestDetails: queueEntry.requestDetails || "",
    consultationStatus: "in_progress",
    consultationRecordId: consultation._id,
    nursingAssessment: { ...nursingAssessment },
    clinicalRecord: { subjective: consultation.subjective, objective: consultation.objective, assessment: consultation.assessment, treatment: consultation.plan, medication: consultation.otc, firstAid: consultation.firstAid, safetyChecklist: consultation.safetyChecklist, notes: consultation.sessionNotes, vitals: vitalsSnapshot },
  };
  await MedicalProfile.findOneAndUpdate(
    { $or: [{ consultationRecord: consultation._id }, { "fields.medicalWorkflowId": queueEntry.medicalWorkflow?._id }] },
    { $set: { student: queueEntry.student._id, consultationRecord: consultation._id, studentId: queueEntry.student.studentId, purpose: queueEntry.serviceType, provider: req.user.name || "", physicalExamIncluded: queueEntry.medicalWorkflow?.physicalExamIncluded || false, laboratoryExamIncluded: queueEntry.medicalWorkflow?.laboratoryExamIncluded || false, fields: profileFields, examinedAt: now } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (linkedVitals) savedQueueEntry.linkedVitals = linkedVitals;
  req.app.get("io")?.to("clinical-queue").emit("queue:update", savedQueueEntry);
  res.json({ consultation, queueEntry: savedQueueEntry, syncedAt: now });
});

router.post("/consultations", requireClinicalRole, async (req, res) => {
  const { queueEntryId, visitType, secondaryVitals = {} } = req.body;
  const queueEntry = await QueueEntry.findById(queueEntryId).populate("student").populate("linkedVitals");
  if (!queueEntry) return res.status(404).json({ message: "Queue entry not found" });
  const workflow = await MedicalWorkflow.findOne({ queueEntry: queueEntry._id });
  const role = String(req.user.role || "").toLowerCase();
  const isConsultation = ["Medical Consultation", "Dental Consultation"].includes(queueEntry.serviceType);
  if (isConsultation) {
    if (!(["physician", "doctor", "dentist"].includes(role)) || queueEntry.status !== "provider_in_session") {
      return res.status(409).json({ message: "A physician or dentist must start this consultation before completing it." });
    }
    if (!providerRoleMatches(queueEntry.serviceType, role)) {
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
  if (hasVitals) await VitalsLog.findOneAndUpdate(
    { queueEntry: queueEntry._id },
    { $setOnInsert: { student: queueEntry.student._id, queueEntry: queueEntry._id, source: "manual_staff_entry", ...secondaryVitals } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const { queueEntryId: _id, secondaryVitals: _vitals, ...recordFields } = req.body;
  const intakeFields = recordFields.intakeFields && typeof recordFields.intakeFields === "object" && !Array.isArray(recordFields.intakeFields) ? recordFields.intakeFields : workflow?.initialFields || {};
  if (JSON.stringify(intakeFields).length > 20000) return res.status(400).json({ message: "Medical record intake fields are invalid or too large." });
  if (isConsultation && recordFields.nursingAssessment && typeof recordFields.nursingAssessment === "object") {
    queueEntry.nursingAssessment = {
      physicalExam: String(recordFields.nursingAssessment.physicalExam || "").trim().slice(0, 4000),
      laboratoryExamination: String(recordFields.nursingAssessment.laboratoryExamination || "").trim().slice(0, 4000),
      notes: String(recordFields.nursingAssessment.notes || "").trim().slice(0, 4000),
      physicalExamIncluded: Boolean(recordFields.nursingAssessment.physicalExamIncluded),
      laboratoryExamIncluded: Boolean(recordFields.nursingAssessment.laboratoryExamIncluded),
      fields: recordFields.nursingAssessment.fields && typeof recordFields.nursingAssessment.fields === "object" && !Array.isArray(recordFields.nursingAssessment.fields)
        ? Object.fromEntries(Object.entries(recordFields.nursingAssessment.fields).slice(0, 40).map(([key, value]) => [String(key).slice(0, 80), String(value ?? "").trim().slice(0, 2000)]))
        : {},
      recordedBy: queueEntry.nursingAssessment?.recordedBy || req.user.id,
      recordedAt: queueEntry.nursingAssessment?.recordedAt || new Date(),
    };
    await queueEntry.save();
  }
  const consultation = await ConsultationRecord.findOneAndUpdate(
    { queueEntry: queueEntry._id },
    { $set: {
      subjective: String(recordFields.subjective || "").trim(),
      objective: String(recordFields.objective || "").trim(),
      assessment: String(recordFields.assessment || "").trim(),
      plan: String(recordFields.plan || "").trim(),
      otc: recordFields.otc || {},
      firstAid: recordFields.firstAid || {},
      safetyChecklist: recordFields.safetyChecklist || {},
      sessionNotes: String(recordFields.sessionNotes || "").trim(),
      natureOfInquiry: String(recordFields.natureOfInquiry || "").trim(),
      inquiryResponse: String(recordFields.inquiryResponse || "").trim(),
      serviceType: queueEntry.serviceType,
      requestDetails: queueEntry.requestDetails || "",
      student: queueEntry.student._id,
      queueEntry: queueEntry._id,
      attendingStaff: req.user.id,
      visitType,
      status: "completed",
      vitalsSnapshot: { ...(queueEntry.linkedVitals?.toObject?.() || {}), ...secondaryVitals },
    } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  if (workflow) {
    workflow.initialFields = intakeFields;
    const attendingProvider = await User.findById(req.user.id).select("name");
    const profileFields = {
      ...intakeFields,
      diagnosis: String(req.body.assessment || "").trim(),
      treatment: String(req.body.plan || "").trim(),
      visitType,
      serviceType: queueEntry.serviceType,
      requestDetails: queueEntry.requestDetails || "",
      clinicalRecord: {
        subjective: String(req.body.subjective || "").trim(),
        objective: String(req.body.objective || "").trim(),
        assessment: String(req.body.assessment || "").trim(),
        treatment: String(req.body.plan || "").trim(),
        medication: consultation.otc,
        firstAid: consultation.firstAid,
        notes: consultation.sessionNotes,
        vitals: consultation.vitalsSnapshot,
      },
      nursingAssessment: {
        physicalExam: queueEntry.nursingAssessment?.physicalExam || "",
        laboratoryExamination: queueEntry.nursingAssessment?.laboratoryExamination || "",
        notes: queueEntry.nursingAssessment?.notes || "",
        physicalExamIncluded: Boolean(queueEntry.nursingAssessment?.physicalExamIncluded),
        laboratoryExamIncluded: Boolean(queueEntry.nursingAssessment?.laboratoryExamIncluded),
        fields: queueEntry.nursingAssessment?.fields || {},
        recordedAt: queueEntry.nursingAssessment?.recordedAt || null,
      },
      consultationRecordId: consultation._id,
    };
    let medicalProfile = await MedicalProfile.findOne({ $or: [{ consultationRecord: consultation._id }, { "fields.consultationRecordId": consultation._id }, { "fields.medicalWorkflowId": workflow._id }] });
    if (medicalProfile) {
      medicalProfile.consultationRecord = consultation._id;
      medicalProfile.student = queueEntry.student._id;
      medicalProfile.studentId = queueEntry.student.studentId;
      medicalProfile.purpose = workflow.service;
      medicalProfile.provider = attendingProvider?.name || medicalProfile.provider || "";
      medicalProfile.physicalExamIncluded = workflow.physicalExamIncluded;
      medicalProfile.laboratoryExamIncluded = workflow.laboratoryExamIncluded;
      medicalProfile.fields = { ...(medicalProfile.fields || {}), ...profileFields };
      medicalProfile.examinedAt = new Date();
      await medicalProfile.save();
    } else {
      medicalProfile = await MedicalProfile.create({
        student: queueEntry.student._id,
        consultationRecord: consultation._id,
        studentId: queueEntry.student.studentId,
        purpose: workflow.service,
        provider: attendingProvider?.name || "",
        physicalExamIncluded: workflow.physicalExamIncluded,
        laboratoryExamIncluded: workflow.laboratoryExamIncluded,
        fields: { medicalWorkflowId: workflow._id, ...profileFields },
        examinedAt: new Date(),
      });
    }
    if (!medicalProfile) return res.status(500).json({ message: "The clinical session was saved, but its Medical Profile entry could not be saved. The queue was not marked complete; retry completion." });
    workflow.status = "completed";
    workflow.medicalProfile = medicalProfile._id;
    workflow.diagnosis = String(req.body.assessment || "").trim();
    workflow.treatment = String(req.body.plan || "").trim();
    pushWorkflowEvent(workflow, "completed", `${queueEntry.serviceType} assessment and provider consultation completed.`, req.user.id);
    await workflow.save();
  }
  const completedAt = new Date();
  const previousQueueStatus = queueEntry.status;
  const completedQueueEntry = await QueueEntry.findOneAndUpdate(
    { _id: queueEntry._id, status: queueEntry.status },
    { $set: { status: "completed", completedAt }, $push: { statusHistory: { from: previousQueueStatus, to: "completed", actor: req.user.id, at: completedAt } } },
    { new: true },
  );
  if (!completedQueueEntry) return res.status(409).json({ message: "The EMR session record was saved, but the queue state changed before completion. Refresh the queue and review the saved visit." });
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

router.get("/students/:id/medical-profiles", requireRole("nurse", "supervisor", "physician", "dentist", "superadmin"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  res.json(await MedicalProfile.find({ student: req.params.id }).sort({ examinedAt: -1 }));
});
router.post("/students/:id/medical-profiles", requireClinicalRole, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid student ID" });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  if (isWorkflowManagedPurpose(req.body?.purpose)) return res.status(409).json({ message: "Consultation profiles are written only after their linked clinical workflow is completed." });
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
  if (typeof req.body.purpose === "string" && isWorkflowManagedPurpose(req.body.purpose)) return res.status(409).json({ message: "Consultation purposes must be managed through their clinical workflow." });
  const updates = { fields };
  if (typeof req.body.purpose === "string" && req.body.purpose.trim()) updates.purpose = req.body.purpose.trim();
  if (typeof req.body.provider === "string") updates.provider = req.body.provider.trim();
  const profile = await MedicalProfile.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!profile) return res.status(404).json({ message: "Medical profile not found" });
  res.json(profile);
});
router.get("/students/:id/history", requireRole("nurse", "supervisor", "physician", "dentist", "superadmin"), async (req, res) => {
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
  const notificationEmail = String(student.email || req.body.notificationEmail || "").trim().toLowerCase();
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
  const notificationQueued = areDocumentNotificationsConfigured();
  if (notificationQueued) void sendDocumentStatusNotification(document, "Pending");
  const result = document.toObject();
  delete result.fileData;
  result.fileUrl = `/api/documents/${document._id}/file`;
  res.status(201).json({ ...result, notificationQueued, notificationMessage: notificationQueued ? undefined : "Email settings are incomplete on the server." });
});
router.get("/documents", requireDocumentRole, async (_req, res) => {
  const documents = await ExternalDocument.find().select("-fileData").populate("student", "studentId firstName lastName affiliation program department").sort({ submittedAt: -1, createdAt: -1 });
  await Promise.all(documents.filter((document) => document.status === "Verified").map((document) => issueVerifiedClearanceDocument(document)));
  const generatedCertificates = await ExternalDocument.find({ sourceDocument: { $in: documents.map((document) => document._id) } }).select("-fileData").lean();
  const certificatesBySource = new Map(generatedCertificates.map((certificate) => [String(certificate.sourceDocument), certificate]));
  res.json(documents.map((document) => {
    const result = document.toObject();
    if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
    result.issuedCertificate = certificatesBySource.get(String(result._id)) || null;
    result.clearanceCertificateEligible = result.recordType !== "clearance_certificate" && Boolean(clearancePurposeFor(result));
    return result;
  }));
});
router.patch("/documents/:id/health-declaration", requireRole("superadmin"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid declaration ID." });
  const document = await ExternalDocument.findById(req.params.id);
  if (!document || !isHealthDeclarationDocument(document) || !document.submissionDetails?.healthDeclaration) return res.status(404).json({ message: "Health Status Declaration not found." });
  const duplicateDeclaration = await ExternalDocument.findOne({ student: document.student, recordType: "health_declaration", _id: { $ne: document._id } }).select("_id");
  if (duplicateDeclaration) return res.status(409).json({ message: "Another declaration is already the patient's active one-time record. Review that record before editing this historical copy." });
  document.recordType = "health_declaration";
  const student = await Student.findById(document.student);
  if (!student) return res.status(404).json({ message: "The linked patient record no longer exists." });
  const declaration = normalizeDeclaration(req.body?.declaration || {}, student);
  const validationError = validateDeclaration(declaration, student);
  if (validationError) return res.status(400).json({ message: validationError });
  const previous = document.submissionDetails.healthDeclaration;
  const changedFields = materialDeclarationChanges(previous, declaration);
  if (!changedFields.length) {
    applyDeclarationToPatient(student, declaration, document, document.status);
    await student.save();
    return res.json({ document: document.toObject(), patient: student.toObject({ virtuals: true }), message: "No declaration fields changed; patient profile synchronized." });
  }
  const wasVerified = declarationRequiresReview(document.status);
  document.declarationHistory.push({ declaration: previous, changedFields, actor: req.user.id, source: "admin_correction", at: new Date() });
  document.submissionDetails = { ...(document.submissionDetails || {}), healthDeclaration: declaration };
  document.fileData = healthDeclarationToPdf(declaration);
  document.name = "Health_Status_Declaration.pdf";
  document.contentType = "application/pdf";
  if (wasVerified) {
    document.status = "Pending";
    document.verificationRemarks = `Admin correction requires review: ${changedFields.join(", ")}`;
    document.verificationHistory.push({ status: "Pending", remarks: "A material administrator correction was made; re-verification is required.", actor: req.user.id, at: new Date() });
    document.verifiedBy = undefined;
    document.verifiedAt = undefined;
  }
  try {
    await document.save();
  } catch (error) {
    if (error?.name === "VersionError") return res.status(409).json({ message: "This declaration changed in another request. Reload it before making another correction." });
    throw error;
  }
  applyDeclarationToPatient(student, declaration, document, document.status);
  await student.save();
  const result = document.toObject();
  delete result.fileData;
  result.fileUrl = `/api/documents/${document._id}/file`;
  return res.json({ document: result, patient: student.toObject({ virtuals: true }), changedFields, message: wasVerified ? "The correction was saved. The declaration is Pending Verification until HSO staff re-review it." : "The existing declaration was corrected and the patient profile synchronized." });
});

router.patch("/documents/:id/status", requireRole("nurse", "supervisor"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid document ID" });
  const allowedStatuses = ["Pending", "Verified", "Rejected"];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ message: "Invalid document status" });
  const remarks = String(req.body.remarks || "").trim().slice(0, 1000);
  if (req.body.status !== "Pending" && remarks.length < 3) return res.status(400).json({ message: "Add a short verification or rejection remark before saving this decision." });
  const document = await ExternalDocument.findById(req.params.id).select("-fileData").populate("student", "studentId firstName lastName email affiliation program department");
  if (!document) return res.status(404).json({ message: "Document not found" });
  if (document.recordType === "clearance_certificate" || document.status === "Issued") return res.status(409).json({ message: "Issued clearance certificates are part of the permanent Medical Files history and cannot be changed here." });
  const retryVerifiedCertificate = document.status === "Verified" && req.body.status === "Verified";
  if (["Verified", "Rejected"].includes(document.status) && !retryVerifiedCertificate) {
    return res.status(409).json({ message: "This document has already been decided and its status cannot be changed." });
  }
  const statusChanged = document.status !== req.body.status;
  if (!retryVerifiedCertificate) {
    document.status = req.body.status;
    document.verificationRemarks = remarks;
    document.verifiedBy = req.user.id;
    document.verifiedAt = new Date();
    document.verificationHistory.push({ status: req.body.status, remarks, actor: req.user.id, at: document.verifiedAt });
    await document.save();
  }
  const issuedCertificate = document.status === "Verified" ? await issueVerifiedClearanceDocument(document, req.user.id) : null;
  let healthDeclarationPatient = null;
  if (isHealthDeclarationDocument(document) && document.submissionDetails?.healthDeclaration) {
    const patient = await Student.findById(document.student._id || document.student);
    if (patient) {
      applyDeclarationToPatient(patient, document.submissionDetails.healthDeclaration, document, document.status);
      await patient.save();
      healthDeclarationPatient = patient.toObject({ virtuals: true });
    }
  }
  let notificationQueued = false;
  if (statusChanged || document.lastNotifiedStatus !== document.status) {
    notificationQueued = Boolean(document.student?.email || document.notificationEmail) && areDocumentNotificationsConfigured();
    if (notificationQueued) {
      void sendDocumentStatusNotification(document, document.status);
    }
  }
  await document.populate("student", "studentId firstName lastName affiliation program department");
  document.fileData = undefined;
  const result = document.toObject();
  if (result.name) result.fileUrl = `/api/documents/${result._id}/file`;
  res.json({ ...result, issuedCertificate: issuedCertificate?.toObject?.() || null, clearanceCertificateEligible: result.recordType !== "clearance_certificate" && Boolean(clearancePurposeFor(result)), ...(healthDeclarationPatient ? { patient: healthDeclarationPatient } : {}), notificationQueued, notificationMessage: notificationQueued ? undefined : "Email was not queued. Check the student's email and server email settings." });
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
