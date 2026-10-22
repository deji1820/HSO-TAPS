import Student from "../models/Student.js";
import ExternalDocument from "../models/ExternalDocument.js";
import { SyncLog } from "../models/FormPipeline.js";
import { areDocumentNotificationsConfigured, sendDocumentStatusNotification } from "./documentNotifications.service.js";

/**
 * Handles inbound Power Automate webhook payloads from Microsoft Forms
 * (Health Status Declaration, Chest X-Ray, Medical/Dental Booking).
 * Matches on Student ID and files the result into ExternalDocument + SyncLog.
 */
export async function handleFormSubmission({ pipelineId, formName, payload }) {
  const studentIdRaw = payload.studentId?.trim();
  const student = studentIdRaw ? await Student.findOne({ studentId: studentIdRaw }) : null;

  if (!student) {
    await SyncLog.create({ formName, studentIdRaw, syncResult: "unmatched", rawPayload: payload });
    return { matched: false };
  }

  try {
    const doc = await ExternalDocument.create({
      student: student._id,
      documentTitle: payload.documentTitle || formName,
      formSource: "MS Forms",
      fileUrl: payload.fileUrl,
      submittedAt: payload.submittedAt || new Date(),
      status: "Pending",
      notificationEmail: payload.notificationEmail || payload.email || payload.studentEmail || payload.respondentEmail || student.email,
    });
    if (doc.notificationEmail && areDocumentNotificationsConfigured()) {
      void sendDocumentStatusNotification(doc, "Pending", doc.notificationEmail);
    } else {
      console.warn(`[Forms] Pending email notice not started for document ${doc._id}: missing email or email settings.`);
    }
    await SyncLog.create({
      formName,
      studentIdRaw,
      matchedStudent: student._id,
      syncResult: "matched",
      rawPayload: payload,
    });
    return { matched: true, document: doc };
  } catch (err) {
    await SyncLog.create({ formName, studentIdRaw, syncResult: "exception", rawPayload: { error: err.message, payload } });
    throw err;
  }
}
