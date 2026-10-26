import mongoose from "mongoose";

const academicCalendarSchema = new mongoose.Schema({
  key: { type: String, default: "current", unique: true },
  currentAcademicYear: { type: String, required: true, match: /^\d{4}-\d{4}$/ },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model("AcademicCalendar", academicCalendarSchema);
