import mongoose from "mongoose";

/**
 * SOAP-format clinical note + medication/relief + general inquiry tabs,
 * exactly matching the "Active Session" workstation UI.
 */
const consultationRecordSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    queueEntry: { type: mongoose.Schema.Types.ObjectId, ref: "QueueEntry" },
    attendingStaff: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    visitType: {
      type: String,
      enum: ["Walk-in Medical Consultation", "Dental Consultation", "Medication and Relief", "General Inquiry"],
      required: true,
    },

    // Clinical Charting tab
    subjective: String,
    objective: String,
    assessment: String,
    plan: String,

    // Medication & Relief tab
    otc: {
      itemDispensed: String,
      quantity: String,
      instructions: String,
    },
    firstAid: {
      careProvided: String,
      appliedTo: String,
      restRequired: String,
    },
    safetyChecklist: {
      verifiedIdentityAndAllergies: { type: Boolean, default: false },
      confirmedNoAdverseReactions: { type: Boolean, default: false },
      instructedDosageAndHygiene: { type: Boolean, default: false },
    },
    sessionNotes: String,

    // General Inquiry tab
    natureOfInquiry: String,
    inquiryResponse: String,

    vitalsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    visitDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("ConsultationRecord", consultationRecordSchema);


