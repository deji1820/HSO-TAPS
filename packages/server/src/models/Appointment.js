import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    serviceType: {
      type: String,
      enum: ["Medical Consultation", "Dental Consultation", "Medical Clearance"],
      required: true,
    },
    purpose: { type: String, trim: true, maxlength: 200 },
    dateKey: { type: String, required: true }, // YYYY-MM-DD in the kiosk's local calendar
    timeSlot: { type: String, required: true },
    notificationEmail: { type: String, trim: true, lowercase: true },
    assignedProvider: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["scheduled", "checked_in", "cancelled", "completed", "no_show"], default: "scheduled", index: true },
    decisionStatus: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending", index: true },
    decisionAt: Date,
    queueEntry: { type: mongoose.Schema.Types.ObjectId, ref: "QueueEntry" },
    checkedInAt: Date,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    noShowAt: Date,
    noShowExempt: { type: Boolean, default: false, index: true },
    noShowExemptionReason: String,
    noShowExemptionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    noShowExemptionAt: Date,
    statusHistory: [{ from: String, to: String, actor: String, at: Date, reason: String }],
  },
  { timestamps: true }
);

// One active booking per service and slot; cancelled slots can be booked again.
appointmentSchema.index(
  { serviceType: 1, dateKey: 1, timeSlot: 1 },
  { unique: true, partialFilterExpression: { status: "scheduled" } }
);

appointmentSchema.index(
  { assignedProvider: 1, dateKey: 1, timeSlot: 1 },
  { unique: true, partialFilterExpression: { assignedProvider: { $type: "objectId" }, status: { $in: ["scheduled", "checked_in"] } } }
);
appointmentSchema.index({ status: 1, decisionStatus: 1, dateKey: 1, noShowExempt: 1 });

export default mongoose.model("Appointment", appointmentSchema);
