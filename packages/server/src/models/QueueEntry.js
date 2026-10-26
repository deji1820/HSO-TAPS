import mongoose from "mongoose";

/**
 * Live queue row — created the moment a student finishes the kiosk flow
 * (only for "Clinic Consultation" / "Other Services", or a "Self-Service"
 * screening that got overridden due to abnormal vitals).
 * This is what the Live Nurse/Doctor Dashboard subscribes to over Socket.IO.
 */
const queueEntrySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    medicalWorkflow: { type: mongoose.Schema.Types.ObjectId, ref: "MedicalWorkflow", index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    queueNumber: String, // e.g. "R0003", "M0001"
    priorityLevel: { type: String, enum: ["High Priority", "Standard Priority", "Routine Check"], required: true },
    serviceType: {
      type: String,
      enum: [
        "Quick Health Screening",
        "Medical Consultation",
        "Dental Consultation",
        "Medical Clearance",
        "Prescription/OTC Pickup",
        "General Inquiry",
      ],
      required: true,
    },
    reason: String, // short label shown in the queue list, e.g. "High Temperature"
    requestDetails: String, // full free-text request (e.g. Prescription/OTC or General Inquiry details) — `reason` above is just a short display label, this is the durable record staff read
    status: {
      type: String,
      enum: ["waiting", "called", "in_session", "awaiting_provider", "provider_in_session", "completed", "cancelled"],
      default: "waiting",
    },
    linkedVitals: { type: mongoose.Schema.Types.ObjectId, ref: "VitalsLog" },
    calledAt: Date,
    startedAt: Date,
    providerStartedAt: Date,
    completedAt: Date,
    nursingAssessment: {
      physicalExam: { type: String, maxlength: 4000 },
      laboratoryExamination: { type: String, maxlength: 4000 },
      notes: { type: String, maxlength: 4000 },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      recordedAt: Date,
    },
  },
  { timestamps: true }
);

queueEntrySchema.index({ appointment: 1 }, { unique: true, partialFilterExpression: { appointment: { $type: "objectId" } } });

export default mongoose.model("QueueEntry", queueEntrySchema);
