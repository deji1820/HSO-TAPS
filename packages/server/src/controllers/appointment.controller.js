import Student from "../models/Student.js";
import Appointment from "../models/Appointment.js";

const SERVICES = new Set(["Medical Consultation", "Dental Consultation", "Medical Clearance"]);
const TIMES = new Set([
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM",
]);

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}`;
}

function slotIsInFuture(dateKey, timeSlot) {
  if (dateKey !== todayInManila()) return true;
  const [, hourText, minuteText, period] = timeSlot.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/) || [];
  if (!hourText) return false;
  const hour = (Number(hourText) % 12) + (period === "PM" ? 12 : 0);
  const slotMinutes = hour * 60 + Number(minuteText);
  const now = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return slotMinutes > Number(now.hour) * 60 + Number(now.minute);
}

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() !== 0;
}

export async function getAvailability(req, res) {
  const { serviceType, date } = req.query;
  if (!SERVICES.has(serviceType) || !validDateKey(date) || date < todayInManila()) {
    return res.status(400).json({ message: "Choose a valid service and a non-past weekday." });
  }
  const appointments = await Appointment.find({ serviceType, dateKey: date, status: "scheduled" }).select("timeSlot -_id");
  const unavailableTimes = appointments.map(({ timeSlot }) => timeSlot);
  res.json({ unavailableTimes: [...new Set([...unavailableTimes, ...[...TIMES].filter((time) => !slotIsInFuture(date, time))])] });
}

export async function createAppointment(req, res) {
  const { studentId, serviceType, purpose, date, timeSlot } = req.body;
  if (!SERVICES.has(serviceType) || !validDateKey(date) || date < todayInManila() || !TIMES.has(timeSlot) || !slotIsInFuture(date, timeSlot)) {
    return res.status(400).json({ message: "The selected service, date, or time is invalid." });
  }
  if (serviceType === "Medical Clearance" && (!purpose || typeof purpose !== "string" || !purpose.trim())) {
    return res.status(400).json({ message: "Select a medical clearance purpose before booking." });
  }

  const student = await Student.findOne({
    $or: [{ studentId }, { rfidTagUid: studentId?.toUpperCase() }],
    isActive: { $ne: false },
  });
  if (!student) return res.status(404).json({ message: "Unknown student." });

  try {
    const appointment = await Appointment.create({
      student: student._id,
      serviceType,
      purpose: purpose?.trim(),
      dateKey: date,
      timeSlot,
    });
    req.app.get("io")?.emit("appointment:new", appointment);
    return res.status(201).json({ appointment });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That appointment time was just booked. Please choose another available time." });
    }
    throw error;
  }
}

export async function listAppointments(_req, res) {
  const appointments = await Appointment.find({ status: "scheduled", dateKey: { $gte: todayInManila() } })
    .populate("student", "studentId firstName lastName program")
    .sort({ dateKey: 1, timeSlot: 1 });
  res.json(appointments);
}
