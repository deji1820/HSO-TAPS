import mongoose from "mongoose";
const patientHistorySchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, unique: true },
  familyHistory: { type: mongoose.Schema.Types.Mixed, default: { answers: {}, others: "" } },
  medicalHistory: { type: mongoose.Schema.Types.Mixed, default: { answers: {} } },
}, { timestamps: true });
export default mongoose.model("PatientHistory", patientHistorySchema);
