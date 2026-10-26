import mongoose from "mongoose";
const medicalProfileSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  consultationRecord: { type: mongoose.Schema.Types.ObjectId, ref: "ConsultationRecord" },
  studentId: String, purpose: { type: String, required: true }, provider: String,
  physicalExamIncluded: Boolean, laboratoryExamIncluded: Boolean,
  fields: { type: mongoose.Schema.Types.Mixed, default: {} }, examinedAt: { type: Date, default: Date.now },
}, { timestamps: true });
medicalProfileSchema.index({ consultationRecord: 1 }, { unique: true, partialFilterExpression: { consultationRecord: { $type: "objectId" } } });
export default mongoose.model("MedicalProfile", medicalProfileSchema);
