import mongoose from "mongoose";

/**
 * Shared student/employee health record, populated from the admin roster
 * import and linked to an RFID card after kiosk identity confirmation.
 * Matches the "Is this your profile?" kiosk screen + EMR header block.
 */
const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, index: true }, // e.g. "2024-100123"
    affiliation: { type: String, enum: ["Student", "Employee"], default: "Student", index: true },
    department: String,
    employeeId: { type: String, sparse: true, index: true },
    rfidTagUid: { type: String, unique: true, sparse: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: Date,
    age: Number, // Derived from dateOfBirth for compatibility with existing clinical records.
    sex: { type: String, enum: ["Male", "Female", "Other", "Prefer not to say"] },
    program: String, // e.g. "BS Information Technology"
    yearLevel: String, // e.g. "2nd Year"
    guardianContact: String,
    email: { type: String, trim: true, lowercase: true },
    healthFlags: [{ type: String }], // e.g. ["Asthma", "Peanut Allergy"]
    schoolYear: String, // e.g. "2026-2027"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Student", studentSchema);
