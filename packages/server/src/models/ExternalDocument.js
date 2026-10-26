import mongoose from "mongoose";

/**
 * Files/records synced in from Microsoft Forms (Health Status Declaration,
 * Chest X-Ray, etc.) via Power Automate webhook, matched to a student by ID.
 * Shown in EMR > "External Documents" tab.
 */
const externalDocumentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    recordType: { type: String, enum: ["submission", "clearance_certificate", "health_declaration"], default: "submission", index: true },
    sourceWorkflow: { type: mongoose.Schema.Types.ObjectId, ref: "MedicalWorkflow" },
    documentTitle: String, // "Health Status Declaration"
    formSource: { type: String, default: "MS Forms" },
    fileUrl: String, // link to the stored file (e.g. SharePoint / S3 / GridFS)
    category: String,
    examDate: Date,
    submissionDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    name: String,
    contentType: String,
    fileData: Buffer,
    status: { type: String, enum: ["Pending", "Verified", "Rejected", "Issued"], default: "Pending" },
    verificationRemarks: String,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: Date,
    verificationHistory: [{ status: String, remarks: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }],
    declarationHistory: [{ declaration: mongoose.Schema.Types.Mixed, changedFields: [String], actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, source: { type: String, enum: ["patient_submission", "patient_resubmission", "admin_correction"] }, at: { type: Date, default: Date.now } }],
    notificationEmail: { type: String, trim: true, lowercase: true },
    lastNotifiedStatus: { type: String, enum: ["Pending", "Verified", "Rejected"] },
    notificationSentAt: Date,
    submittedAt: Date,
  },
  { timestamps: true, optimisticConcurrency: true }
);

externalDocumentSchema.index({ sourceWorkflow: 1 }, { unique: true, partialFilterExpression: { sourceWorkflow: { $type: "objectId" } } });
externalDocumentSchema.index({ student: 1, recordType: 1 }, { unique: true, partialFilterExpression: { recordType: "health_declaration" } });

export default mongoose.model("ExternalDocument", externalDocumentSchema);


