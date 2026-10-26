import mongoose from "mongoose";

const medicalWorkflowSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  requestKey: { type: String, unique: true, sparse: true },
  medicalProfile: { type: mongoose.Schema.Types.ObjectId, ref: "MedicalProfile" },
  queueEntry: { type: mongoose.Schema.Types.ObjectId, ref: "QueueEntry" },
  service: { type: String, enum: ["Medical Consultation", "Dental Consultation", "Medical Clearance"], required: true },
  purpose: { type: String, required: true },
  affiliation: { type: String, enum: ["Student", "Employee"], required: true },
  initialFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  physicalExamIncluded: { type: Boolean, default: false },
  laboratoryExamIncluded: { type: Boolean, default: false },
  status: { type: String, enum: ["queued", "assessment", "provider_review", "requirements_pending", "ready_for_approval", "approval_in_progress", "approved", "completed", "cancelled"], default: "queued", index: true },
  requirements: [{ text: String, kind: String, required: Boolean, conditional: Boolean, condition: String, status: { type: String, enum: ["pending", "satisfied", "not_applicable"], default: "pending" }, verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, verifiedAt: Date, evidence: String }],
  assessment: { type: mongoose.Schema.Types.Mixed, default: {} },
  diagnosis: String,
  treatment: String,
  providerApproval: { approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, providerName: String, providerRole: String, approvedAt: Date },
  providerStatement: String,
  certificateIssuedAt: Date,
  certificateIssuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  events: [{ type: { type: String, required: true }, description: { type: String, required: true }, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }],
}, { timestamps: true });

medicalWorkflowSchema.index({ student: 1, createdAt: -1 });
export default mongoose.model("MedicalWorkflow", medicalWorkflowSchema);
