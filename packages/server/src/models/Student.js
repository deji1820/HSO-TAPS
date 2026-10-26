import mongoose from "mongoose";
import { calculateAge } from "../services/patientInformation.js";

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
    middleName: String,
    lastName: { type: String, required: true },
    dateOfBirth: Date,
    sex: { type: String, enum: ["Male", "Female", "Other", "Prefer not to say"] },
    religion: String,
    homeAddress: String,
    mobileNumber: String,
    program: String, // e.g. "BS Information Technology"
    yearLevel: String, // e.g. "2nd Year"
    yearLevelOverride: String,
    yearLevelOverrideReason: String,
    yearLevelOverrideBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    yearLevelOverrideAt: Date,
    guardianContact: String,
    guardianName: String,
    email: { type: String, trim: true, lowercase: true },
    healthFlags: [{ type: String }], // e.g. ["Asthma", "Peanut Allergy"]
    healthIndicators: { type: mongoose.Schema.Types.Mixed, default: {} },
    hasDisability: Boolean,
    specifiedDisability: String,
    treatmentConsent: String,
    travelRestrictionsOrIssues: String,
    healthDeclarationRecord: { type: mongoose.Schema.Types.ObjectId, ref: "ExternalDocument" },
    healthDeclarationStatus: { type: String, enum: ["Pending", "Verified", "Rejected"] },
    healthDeclarationVerifiedAt: Date,
    schoolYear: String, // e.g. "2026-2027"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studentSchema.virtual("age").get(function getAge() { return calculateAge(this.dateOfBirth); });
studentSchema.set("toJSON", { virtuals: true });
studentSchema.set("toObject", { virtuals: true });

export default mongoose.model("Student", studentSchema);
