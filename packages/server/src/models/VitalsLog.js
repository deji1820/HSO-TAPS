import mongoose from "mongoose";

/**
 * One row per kiosk "Quick Health Screening" reading, or per secondary
 * vitals capture inside a consultation. Powers the EMR "Vitals and
 * Physical Metrics" tab and the Data Analytics temperature/illness trends.
 */
const vitalsLogSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    source: { type: String, enum: ["kiosk", "manual_staff_entry"], default: "kiosk" },
    temperatureC: Number,
    heightCm: Number,
    weightKg: Number,
    bmi: Number,
    bmiCategory: String, // "Underweight" | "Normal" | "Overweight" | "Obese"
    bloodPressure: String, // secondary vitals, staff-entered
    pulseRate: Number,
    spo2: Number,
    isFeverFlagged: { type: Boolean, default: false }, // temp >= threshold, see docs/ARCHITECTURE.md
    temperatureStatus: { type: String, enum: ["Hypothermia", "Normal", "Fever"] },
    capturedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("VitalsLog", vitalsLogSchema);
