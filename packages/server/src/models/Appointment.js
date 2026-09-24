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
    status: { type: String, enum: ["scheduled", "checked_in", "cancelled", "completed"], default: "scheduled", index: true },
    queueEntry: { type: mongoose.Schema.Types.ObjectId, ref: "QueueEntry" },
  },
  { timestamps: true }
);

// One active booking per service and slot; cancelled slots can be booked again.
appointmentSchema.index(
  { serviceType: 1, dateKey: 1, timeSlot: 1 },
  { unique: true, partialFilterExpression: { status: "scheduled" } }
);

export default mongoose.model("Appointment", appointmentSchema);
