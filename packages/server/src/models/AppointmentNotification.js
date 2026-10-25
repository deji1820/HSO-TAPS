import mongoose from "mongoose";

const appointmentNotificationSchema = new mongoose.Schema({
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, index: true },
  type: { type: String, enum: ["booking_received", "decision_accepted", "decision_rejected"], required: true },
  recipient: { type: String, trim: true, lowercase: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ["queued", "sending", "sent", "failed"], default: "queued", index: true },
  attempts: { type: Number, default: 0, min: 0 },
  queuedAt: { type: Date, default: Date.now },
  attemptedAt: Date,
  sentAt: Date,
  failureReason: { type: String, maxlength: 240 },
}, { timestamps: true });

appointmentNotificationSchema.index({ appointment: 1, createdAt: -1 });

export default mongoose.model("AppointmentNotification", appointmentNotificationSchema);
