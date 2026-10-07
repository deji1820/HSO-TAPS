import mongoose from "mongoose";

/**
 * Files/records synced in from Microsoft Forms (Health Status Declaration,
 * Chest X-Ray, etc.) via Power Automate webhook, matched to a student by ID.
 * Shown in EMR > "External Documents" tab.
 */
const externalDocumentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    documentTitle: String, // "Health Status Declaration"
    formSource: { type: String, default: "MS Forms" },
    fileUrl: String, // link to the stored file (e.g. SharePoint / S3 / GridFS)
    category: String,
    examDate: Date,
    submissionDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    name: String,
    contentType: String,
    fileData: Buffer,
    status: { type: String, enum: ["Pending", "Verified", "Rejected"], default: "Pending" },
    submittedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("ExternalDocument", externalDocumentSchema);


