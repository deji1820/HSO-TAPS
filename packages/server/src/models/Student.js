import mongoose from "mongoose";

/**
 * Master student profile — populated via RFID tap / manual entry,
 * and via Admin > "Upload Master Data" batch import.
 * Matches the "Is this your profile?" kiosk screen + EMR header block.
 */
const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, index: true }, // e.g. "2024-100123"
    rfidTagUid: { type: String, unique: true, sparse: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    age: Number,
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
