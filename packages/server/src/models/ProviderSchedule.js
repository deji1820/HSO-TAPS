import mongoose from "mongoose";

const providerScheduleSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  serviceType: { type: String, enum: ["Medical Consultation", "Dental Consultation"], required: true },
  weekdays: { type: [Number], required: true, validate: (days) => days.length > 0 && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 6) },
  startTime: { type: String, required: true, match: /^([01]\d|2[01]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[01]):[0-5]\d$/ },
  slotMinutes: { type: Number, default: 30, enum: [30] },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

providerScheduleSchema.index({ provider: 1, serviceType: 1 }, { unique: true });

export default mongoose.model("ProviderSchedule", providerScheduleSchema);
