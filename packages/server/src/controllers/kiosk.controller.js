import Student from "../models/Student.js";
import VitalsLog from "../models/VitalsLog.js";
import QueueEntry from "../models/QueueEntry.js";
import ExternalDocument from "../models/ExternalDocument.js";
import MedicalWorkflow from "../models/MedicalWorkflow.js";
import { nextQueueNumber } from "../services/queueNumbering.service.js";
import { healthDeclarationToPdf } from "../services/healthDeclarationPdf.js";
import { areDocumentNotificationsConfigured, sendDocumentStatusNotification } from "../services/documentNotifications.service.js";
import { findClearanceRequirement, findDocumentPurposeRequirement } from "../services/clearanceRequirements.js";
import { createMedicalClearanceWorkflow } from "../services/medicalClearanceWorkflow.js";
import { applyDeclarationToPatient, declarationStatusLabel, declarationSubmissionAction, materialDeclarationChanges, normalizeDeclaration, validateDeclaration } from "../services/patientInformation.js";

// Per HSO-TAP_SYSTEM_NOTES: Hypothermia < 35.5, Normal 35.5-37.5, Fever >= 37.8
// (37.6-37.7 is undefined in the notes; treated as Normal here)
const HYPOTHERMIA_BELOW_C = 35.5;
const FEVER_AT_OR_ABOVE_C = 37.8;

function classifyTemperature(t) {
  if (typeof t !== "number") return undefined;
  if (t < HYPOTHERMIA_BELOW_C) return "Hypothermia";
  if (t >= FEVER_AT_OR_ABOVE_C) return "Fever";
  return "Normal";
}

function classifyBmi(bmi) {
  if (bmi == null) return undefined;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

/**
 * POST /api/kiosk/intake
 * Called by kiosk-app at the end of ANY flow (self-service screening,
 * clinic consultation, or other services). Implements the decision-support
 * override: an abnormal temp during "self-service" forces entry + high priority.
 */
export async function submitIntake(req, res) {
  const io = req.app.get("io");
  const { studentId, serviceType, reason, requestDetails, temperatureC, bloodPressure, bloodPressureClassification, pulseRate, heightCm, weightKg, source } = req.body;

  const student = await Student.findOne({
    $or: [{ studentId }, { rfidTagUid: studentId?.toUpperCase() }],
  });
  if (!student) return res.status(404).json({ message: "Unknown student" });
  if (serviceType === "Medical Clearance") {
    const requirement = findClearanceRequirement(student.affiliation, reason);
    let details = requestDetails;
    if (typeof details === "string") { try { details = JSON.parse(details); } catch { details = null; } }
    if (!requirement) return res.status(400).json({ message: "Choose a medical clearance purpose that matches the patient's affiliation." });
    const checkedDocuments = new Set(Array.isArray(details?.documents) ? details.documents : []);
    const missingDocument = requirement.requirements.find((item) => item.kind === "document" && item.required && !checkedDocuments.has(item.text));
    if (details?.acknowledged !== true || missingDocument) {
      return res.status(400).json({ message: "Confirm the clearance requirements and check each required document before joining the queue." });
    }
  }

  let bmi;
  if (heightCm && weightKg) {
    const heightM = heightCm / 100;
    bmi = +(weightKg / (heightM * heightM)).toFixed(1);
  }

  const temperatureStatus = classifyTemperature(temperatureC);
  const isFeverFlagged = temperatureStatus === "Fever";
  const isTempAlert = temperatureStatus === "Fever" || temperatureStatus === "Hypothermia";

  const hasVitals = [temperatureC, bloodPressure, pulseRate, heightCm, weightKg].some((value) => value !== undefined && value !== null && value !== "");
  const vitals = hasVitals ? await VitalsLog.create({
    student: student._id,
    source: source || "kiosk",
    temperatureC,
    temperatureStatus,
    bloodPressure,
    bloodPressureClassification,
    pulseRate,
    heightCm,
    weightKg,
    bmi,
    bmiCategory: classifyBmi(bmi),
    isFeverFlagged,
  }) : null;

  const isSelfService = serviceType === "Quick Health Screening";
  const needsQueueEntry = !isSelfService || isTempAlert; // the override rule

  let queueEntry = null;
  let clearanceWorkflow = null;
  if (needsQueueEntry) {
    const queueData = {
      student: student._id,
      queueNumber: await nextQueueNumber(serviceType),
      priorityLevel: isTempAlert ? "High Priority" : isSelfService ? "Routine Check" : "Standard Priority",
      serviceType,
      reason: isTempAlert ? (isFeverFlagged ? "High Temperature" : "Low Temperature") : reason,
      ...(isTempAlert ? { elevatedVitalsAlert: { active: true, reason: temperatureStatus, flaggedAt: new Date(), history: [{ action: "flagged", at: new Date(), note: "Existing clinic temperature escalation rule" }] } } : {}),
      requestDetails,
      linkedVitals: vitals?._id,
    };
    if (serviceType === "Medical Clearance") {
      clearanceWorkflow = createMedicalClearanceWorkflow({ student, purpose: reason, actor: null });
      queueData.medicalWorkflow = clearanceWorkflow._id;
    }
    queueEntry = await QueueEntry.create(queueData);
    if (clearanceWorkflow) {
      clearanceWorkflow.queueEntry = queueEntry._id;
      clearanceWorkflow.events.push({ type: "queued", description: `Walk-in clearance added to the clinical queue (${queueEntry.queueNumber}).`, at: new Date() });
      await clearanceWorkflow.save();
    }
    io?.to("clinical-queue").to("frontdesk-queue").emit("queue:new", { _id: queueEntry._id });
  }

  res.status(201).json({
    vitals,
    queueEntry,
    ...(clearanceWorkflow ? { clearanceWorkflow: { id: clearanceWorkflow._id, purpose: clearanceWorkflow.purpose, documentSubmissionToken: clearanceWorkflow.documentSubmissionToken } } : {}),
    overrideTriggered: isSelfService && isTempAlert,
    message:
      isSelfService && isTempAlert
        ? "Abnormal temperature detected — please proceed inside the clinic immediately."
        : undefined,
  });
}

export async function submitDocument(req, res) {
  const { studentId, title, category, examDate, submissionDetails, name, contentType, fileData } = req.body || {};
  const notificationEmail = String(req.body?.notificationEmail || "").trim().toLowerCase();
  if (!studentId || !title || !category || !examDate || !name || !fileData || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) {
    return res.status(400).json({ message: "ID, purpose, category, examination date, a valid email address, and file are required." });
  }
  if (typeof fileData !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(fileData)) {
    return res.status(400).json({ message: "The uploaded file is invalid." });
  }
  const clearanceSubmissionToken = String(req.body?.clearanceSubmissionToken || "").trim();
  const clearanceWorkflow = clearanceSubmissionToken
    ? await MedicalWorkflow.findOne({ documentSubmissionToken: clearanceSubmissionToken }).select("+documentSubmissionToken").populate("student", "studentId employeeId firstName lastName email affiliation program department")
    : null;
  if (clearanceSubmissionToken && (!clearanceWorkflow || !clearanceWorkflow.student || !["assessment", "requirements_pending", "ready_for_approval"].includes(clearanceWorkflow.status))) return res.status(404).json({ message: "This clearance document link is invalid or no longer accepting documents." });
  const student = clearanceWorkflow
    ? clearanceWorkflow.student
    : await Student.findOne({ $or: [{ studentId }, { rfidTagUid: String(studentId).toUpperCase() }] });
  if (!student) return res.status(404).json({ message: "No student or employee record matched that ID." });
  if (clearanceWorkflow && studentId && ![student.studentId, student.employeeId, student.rfidTagUid].filter(Boolean).some((value) => String(value).toLowerCase() === String(studentId).toLowerCase())) return res.status(403).json({ message: "This secure link belongs to a different patient." });
  const purpose = clearanceWorkflow?.purpose || submissionDetails?.purpose;
  if (purpose && !findDocumentPurposeRequirement(student.affiliation, purpose)) {
    return res.status(400).json({ message: "Choose a document purpose that matches the patient's affiliation." });
  }

  const bytes = Buffer.from(fileData, "base64");
  if (!bytes.length) return res.status(400).json({ message: "The uploaded file is empty." });
  if (bytes.length > 12 * 1024 * 1024) return res.status(413).json({ message: "Files cannot exceed the current 12 MB server limit." });
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/json"]);
  if (contentType && !allowedTypes.has(contentType)) return res.status(415).json({ message: "Upload a PDF, JPG, PNG, DOCX, or JSON health declaration file." });

  const clearanceRequirementText = String(req.body?.clearanceRequirementText || "").trim();
  if (clearanceWorkflow && (!clearanceRequirementText || !clearanceWorkflow.requirements.some((item) => item.kind === "document" && item.text === clearanceRequirementText))) return res.status(400).json({ message: "Choose a document requirement for this clearance." });

  let storedBytes = bytes;
  let storedContentType = contentType;
  let storedName = name;
  let declarationPayload = null;
  if (contentType === "application/json") {
    if (!/health status declaration/i.test(title)) return res.status(415).json({ message: "JSON uploads are only accepted for Health Status Declaration forms." });
    try {
      const parsedDeclaration = JSON.parse(bytes.toString("utf8"));
      if (!parsedDeclaration || typeof parsedDeclaration !== "object" || Array.isArray(parsedDeclaration)) throw new Error("Invalid form payload");
      const declaration = normalizeDeclaration(parsedDeclaration, student);
      const validationError = validateDeclaration(declaration, student);
      if (validationError) return res.status(400).json({ message: validationError });
      declarationPayload = declaration;
      storedBytes = healthDeclarationToPdf(declarationPayload);
      storedContentType = "application/pdf";
      storedName = name.replace(/\.json$/i, ".pdf");
      if (storedName === name) storedName = "Health_Status_Declaration.pdf";
    } catch {
      return res.status(400).json({ message: "The health declaration form data is invalid." });
    }
  }

  if (declarationPayload) {
    const legacyDeclarationQuery = {
      student: student._id,
      $or: [
        { recordType: "health_declaration" },
        { documentTitle: /health status declaration/i },
      ],
    };
    let document = await ExternalDocument.findOne({ student: student._id, recordType: "health_declaration" }).sort({ submittedAt: 1, createdAt: 1 });
    if (!document) document = await ExternalDocument.findOne({ ...legacyDeclarationQuery, recordType: { $ne: "health_declaration" } }).sort({ submittedAt: 1, createdAt: 1 });
    const existingAction = declarationSubmissionAction(document?.status);
    if (document && existingAction === "block") {
      if (document.submissionDetails?.healthDeclaration) {
        applyDeclarationToPatient(student, document.submissionDetails.healthDeclaration, document, document.status);
        await student.save();
      }
      return res.status(409).json({
        message: document.status === "Verified" ? "Your Health Status Declaration is already verified. The existing declaration is shown below." : "A Health Status Declaration is already awaiting verification. Please do not submit another copy.",
        existing: { id: document._id, status: document.status, statusLabel: declarationStatusLabel(document.status), submittedAt: document.submittedAt, declaration: document.submissionDetails?.healthDeclaration || null },
      });
    }
    const createdNew = !document;
    const now = new Date();
    if (document) {
      document.recordType = "health_declaration";
      const previousDeclaration = document.submissionDetails?.healthDeclaration || {};
      document.declarationHistory.push({ declaration: previousDeclaration, changedFields: materialDeclarationChanges(previousDeclaration, declarationPayload), source: "patient_resubmission", at: now });
      document.submissionDetails = { ...(document.submissionDetails || {}), healthDeclaration: declarationPayload };
      document.fileData = storedBytes;
      document.name = storedName;
      document.contentType = storedContentType;
      document.status = "Pending";
      document.notificationEmail = student.email || notificationEmail;
      document.examDate = new Date(examDate);
      document.verificationHistory.push({ status: "Pending", remarks: "Patient resubmitted the rejected declaration for review.", at: now });
      document.verifiedBy = undefined;
      document.verifiedAt = undefined;
      document.verificationRemarks = "";
      try {
        await document.save();
      } catch (error) {
        if (error?.name === "VersionError") return res.status(409).json({ message: "This declaration was submitted or updated in another request. Refresh to see its current status." });
        throw error;
      }
    } else {
      try {
        document = await ExternalDocument.create({
          student: student._id,
          recordType: "health_declaration",
          documentTitle: title,
          formSource: "Kiosk Document Submission",
          category,
          name: storedName,
          contentType: storedContentType,
          fileData: storedBytes,
          examDate: new Date(examDate),
          submissionDetails: { ...(submissionDetails || {}), healthDeclaration: declarationPayload },
          status: "Pending",
          notificationEmail: student.email || notificationEmail,
          submittedAt: now,
          declarationHistory: [{ declaration: declarationPayload, changedFields: Object.keys(declarationPayload), source: "patient_submission", at: now }],
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await ExternalDocument.findOne({ student: student._id, recordType: "health_declaration" }).sort({ submittedAt: 1, createdAt: 1 });
        return res.status(409).json({ message: "A Health Status Declaration has already been submitted. Refresh to view its current status.", existing: existing ? { id: existing._id, status: existing.status, statusLabel: declarationStatusLabel(existing.status), submittedAt: existing.submittedAt, declaration: existing.submissionDetails?.healthDeclaration || null } : null });
      }
    }
    applyDeclarationToPatient(student, declarationPayload, document, "Pending");
    await student.save();
    const notificationQueued = areDocumentNotificationsConfigured();
    if (notificationQueued) void sendDocumentStatusNotification(document, "Pending");
    return res.status(createdNew ? 201 : 200).json({ id: document._id, status: document.status, statusLabel: declarationStatusLabel(document.status), notificationQueued });
  }

  const document = await ExternalDocument.create({
    student: student._id,
    ...(clearanceWorkflow ? { clearanceWorkflow: clearanceWorkflow._id, clearanceRequirementText } : {}),
    documentTitle: title,
    formSource: "Kiosk Document Submission",
    category,
    name: storedName,
    contentType: storedContentType,
    fileData: storedBytes,
    examDate: new Date(examDate),
    submissionDetails: { ...(submissionDetails || {}), ...(clearanceWorkflow ? { purpose: clearanceWorkflow.purpose, clearanceRequirementText } : {}) },
    status: "Pending",
    notificationEmail: student.email || notificationEmail,
    submittedAt: new Date(),
  });
  const notificationQueued = areDocumentNotificationsConfigured();
  if (notificationQueued) {
    void sendDocumentStatusNotification(document, "Pending");
  } else {
    console.warn(`[Email] Pending notice not started for document ${document._id}: email settings are incomplete.`);
  }
  res.status(201).json({ id: document._id, name: document.name, category: document.category, status: document.status, notificationQueued, notificationMessage: notificationQueued ? undefined : "Email settings are incomplete on the server." });
}

export async function getClearanceDocumentSubmission(req, res) {
  const token = String(req.params.token || "");
  if (!/^[a-f\d]{64}$/i.test(token)) return res.status(400).json({ message: "Invalid clearance document link." });
  const workflow = await MedicalWorkflow.findOne({ documentSubmissionToken: token }).select("+documentSubmissionToken").populate("student", "studentId employeeId firstName lastName email affiliation program department");
  if (!workflow || !workflow.student || !["assessment", "requirements_pending", "ready_for_approval"].includes(workflow.status)) return res.status(404).json({ message: "This clearance document link is invalid or no longer accepting documents." });
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ workflowId: workflow._id, purpose: workflow.purpose, affiliation: workflow.affiliation, requirements: workflow.requirements.filter((item) => item.kind === "document").map((item) => ({ text: item.text, required: item.required, conditional: item.conditional, condition: item.condition })), student: workflow.student });
}

export async function getHealthDeclarationStatus(req, res) {
  const studentId = String(req.params.studentId || "").trim();
  const student = await Student.findOne({ $or: [{ studentId }, { employeeId: studentId }, { rfidTagUid: studentId.toUpperCase() }], isActive: true });
  if (!student) return res.status(404).json({ message: "Student or employee not found." });
  let document = await ExternalDocument.findOne({ student: student._id, recordType: "health_declaration" }).sort({ submittedAt: 1, createdAt: 1 }).select("status submittedAt submissionDetails declarationHistory verificationRemarks verifiedAt");
  if (!document) document = await ExternalDocument.findOne({ student: student._id, documentTitle: /health status declaration/i }).sort({ submittedAt: 1, createdAt: 1 }).select("status submittedAt submissionDetails declarationHistory verificationRemarks verifiedAt");
  if (!document) return res.json({ status: "Not Submitted", statusLabel: "Not Submitted", declaration: null });
  const declaration = document.submissionDetails?.healthDeclaration || null;
  if (declaration) {
    applyDeclarationToPatient(student, declaration, document, document.status);
    await student.save();
  }
  return res.json({ id: document._id, status: document.status, statusLabel: declarationStatusLabel(document.status), submittedAt: document.submittedAt, verifiedAt: document.verifiedAt, verificationRemarks: document.verificationRemarks, declaration });
}
