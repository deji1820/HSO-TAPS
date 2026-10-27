import mongoose from "mongoose";
import Student from "../models/Student.js";
import Appointment from "../models/Appointment.js";
import AppointmentNotification from "../models/AppointmentNotification.js";
import QueueEntry from "../models/QueueEntry.js";
import ConsultationRecord from "../models/ConsultationRecord.js";
import User from "../models/User.js";
import ProviderSchedule from "../models/ProviderSchedule.js";
import { CLEARANCE_REQUIREMENTS, findClearanceRequirement } from "../services/clearanceRequirements.js";
import { sendAppointmentDecisionNotification, retryAppointmentNotification } from "../services/documentNotifications.service.js";
import { escapeRegex, parseAppointmentListFilters } from "../services/appointmentListFilters.js";
import { checkInEligibility } from "../services/appointmentCheckIn.js";
import { nextQueueNumber } from "../services/queueNumbering.service.js";
import { createMedicalClearanceWorkflow } from "../services/medicalClearanceWorkflow.js";
import { getAppointmentWeekdays, findAvailableProviders, isProviderSchedulingConfigured } from "../services/providerScheduling.service.js";
import { PROVIDER_SERVICES, SCHEDULE_SERVICES, providerRoleMatches, slotFitsSchedule, validWeekdays } from "../services/providerAvailability.js";
import { decoratePatientYearLevel } from "../services/patientInformation.js";
import { getConfiguredAcademicYear } from "../services/academicYearDisplay.js";

const SERVICES = new Set(["Medical Consultation", "Dental Consultation", "Medical Clearance", "Prescription & Medicine Request"]);
const SERVICE_CAPACITY = { "Medical Consultation": 1, "Dental Consultation": 1, "Medical Clearance": 2, "Prescription & Medicine Request": 2 };
const TIMES = new Set(Array.from({ length: 26 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hour24 = Math.floor(totalMinutes / 60);
  const hour = hour24 % 12 || 12;
  const minute = String(totalMinutes % 60).padStart(2, "0");
  return `${hour}:${minute} ${hour24 < 12 ? "AM" : "PM"}`;
}));

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
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function serviceAllowsDate(serviceType, dateKey) {
  if (!validDateKey(dateKey)) return false;
  const schedule = await getAppointmentWeekdays(serviceType);
  if (!schedule) return false;
  return schedule.weekdays.includes(new Date(`${dateKey}T00:00:00.000Z`).getUTCDay());
}

const activeAppointmentStatuses = ["scheduled", "checked_in"];

function timeValueIsValid(value) {
  return typeof value === "string" && /^([01]\d|2[01]):[0-5]\d$/.test(value) && Number(value.slice(3)) % 30 === 0;
}

function serviceHours(serviceType) {
  return ["Medical Consultation", "Dental Consultation"].includes(serviceType)
    ? { start: 8 * 60, end: 16 * 60 }
    : { start: 8 * 60, end: 21 * 60 };
}

function slotFitsServiceHours(serviceType, timeSlot) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(String(timeSlot || ""));
  if (!match) return false;
  const hour = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  const start = hour * 60 + Number(match[2]);
  const hours = serviceHours(serviceType);
  return start >= hours.start && start + 30 <= hours.end;
}

function appointmentCapacity(serviceType) {
  return SERVICE_CAPACITY[serviceType] || 1;
}

function toMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function getAvailability(req, res) {
  const { serviceType, date } = req.query;
  if (!SERVICES.has(serviceType) || !(await serviceAllowsDate(serviceType, date)) || date < todayInManila()) {
    return res.status(400).json({ message: "Choose a valid service and a date when that service accepts appointments." });
  }
  const appointments = await Appointment.find({ serviceType, dateKey: date, status: { $in: activeAppointmentStatuses } }).select("timeSlot -_id").lean();
  const counts = new Map();
  for (const { timeSlot } of appointments) counts.set(timeSlot, (counts.get(timeSlot) || 0) + 1);
  const unavailableTimes = new Set([...TIMES].filter((time) => !slotIsInFuture(date, time) || !slotFitsServiceHours(serviceType, time) || (counts.get(time) || 0) >= appointmentCapacity(serviceType)));
  if (PROVIDER_SERVICES.has(serviceType) && await isProviderSchedulingConfigured(serviceType)) {
    for (const timeSlot of TIMES) {
      if (unavailableTimes.has(timeSlot)) continue;
      const result = await findAvailableProviders({ serviceType, dateKey: date, timeSlot });
      if (!result.providers.length) unavailableTimes.add(timeSlot);
    }
  }
  res.json({ unavailableTimes: [...unavailableTimes] });
}

export async function getAppointmentSchedule(req, res) {
  const { serviceType } = req.query;
  if (!SERVICES.has(serviceType)) return res.status(400).json({ message: "Choose a valid appointment service." });
  const schedule = await getAppointmentWeekdays(serviceType);
  return res.json({ ...schedule, dayNames: schedule.weekdays.map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]) });
}

export function getClearanceRequirements(_req, res) {
  return res.json({ items: CLEARANCE_REQUIREMENTS });
}

export async function getKioskTodayAppointment(req, res) {
  const identity = String(req.params.studentId || "").trim();
  if (!identity || identity.length > 100) return res.status(400).json({ message: "A valid student or employee identifier is required." });
  const student = await Student.findOne({
    $or: [{ studentId: identity }, { employeeId: identity }, { rfidTagUid: identity.toUpperCase() }],
    isActive: { $ne: false },
  }).select("_id");
  if (!student) return res.status(404).json({ message: "Patient record not found." });
  const appointment = await Appointment.findOne({
    student: student._id,
    dateKey: todayInManila(),
    status: "scheduled",
    decisionStatus: "accepted",
  }).select("serviceType purpose dateKey timeSlot assignedProvider").populate("assignedProvider", "name role").sort({ timeSlot: 1 });
  if (!appointment) return res.json({ appointment: null });
  return res.json({ appointment: {
    serviceType: appointment.serviceType,
    purpose: appointment.purpose || "",
    dateKey: appointment.dateKey,
    timeSlot: appointment.timeSlot,
    assignedProvider: appointment.assignedProvider ? { name: appointment.assignedProvider.name, role: appointment.assignedProvider.role } : null,
  } });
}

export async function getProviderOptions(req, res) {
  const { serviceType, date, timeSlot, excludeAppointmentId } = req.query;
  if (!PROVIDER_SERVICES.has(serviceType)) return res.status(400).json({ message: "Provider assignment is not available for this service." });
  const configured = await isProviderSchedulingConfigured(serviceType);
  if (date || timeSlot) {
    if (!date || !timeSlot || !validDateKey(date) || !TIMES.has(timeSlot)) return res.status(400).json({ message: "Choose a valid appointment date and time." });
    if (excludeAppointmentId && !mongoose.isValidObjectId(excludeAppointmentId)) return res.status(400).json({ message: "Invalid appointment ID." });
    const result = await findAvailableProviders({ serviceType, dateKey: date, timeSlot, excludeAppointmentId });
    return res.json({ configured, providers: result.providers });
  }

  const roles = serviceType === "Dental Consultation" ? ["dentist"] : serviceType === "Medical Consultation" ? ["physician", "doctor"] : ["nurse"];
  const providers = await User.find({ role: { $in: roles } }).select("name role").sort({ name: 1 });
  res.json({ configured, providers });
}

export async function listProviderSchedules(_req, res) {
  const schedules = await ProviderSchedule.find().populate("provider", "name role email").sort({ serviceType: 1, startTime: 1 });
  res.json(schedules);
}

export async function saveProviderSchedule(req, res) {
  const { providerId, serviceType, weekdays, startTime, endTime } = req.body || {};
  if (!mongoose.isValidObjectId(providerId) || !SCHEDULE_SERVICES.has(serviceType) || !validWeekdays(weekdays)
    || !timeValueIsValid(startTime) || !timeValueIsValid(endTime) || toMinutes(startTime) < 8 * 60
    || toMinutes(endTime) > 21 * 60 || toMinutes(startTime) >= toMinutes(endTime)) {
    return res.status(400).json({ message: "Choose a provider, service, Monday–Saturday workdays, and valid hours between 8:00 AM and 9:00 PM." });
  }
  const provider = await User.findById(providerId).select("name role");
  if (!provider || !providerRoleMatches(serviceType, provider.role)) {
    return res.status(400).json({ message: "Select an active staff account with the correct physician or dentist role." });
  }
  const proposedSchedule = { weekdays, startTime, endTime, slotMinutes: 30 };
  const assigned = await Appointment.find({ assignedProvider: providerId, serviceType, status: { $in: activeAppointmentStatuses } }).select("dateKey timeSlot status");
  const conflicts = assigned.filter((appointment) => appointment.status === "checked_in" || !weekdays.includes(new Date(`${appointment.dateKey}T00:00:00.000Z`).getUTCDay()) || !slotFitsSchedule(appointment.timeSlot, proposedSchedule));
  if (conflicts.length) return res.status(409).json({ message: "This change would leave an active appointment outside the provider’s hours. Reassign those appointments first." });

  try {
    const schedule = await ProviderSchedule.findOneAndUpdate(
      { provider: providerId, serviceType },
      { $set: { weekdays, startTime, endTime, slotMinutes: 30, isActive: true } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).populate("provider", "name role email");
    return res.json(schedule);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "A schedule for this provider and service already exists. Refresh the page and try again." });
    throw error;
  }
}

export async function disableProviderSchedule(req, res) {
  if (!mongoose.isValidObjectId(req.params.scheduleId)) return res.status(400).json({ message: "Invalid provider schedule ID." });
  const schedule = await ProviderSchedule.findById(req.params.scheduleId);
  if (!schedule) return res.status(404).json({ message: "Provider schedule not found." });
  const assigned = await Appointment.exists({ assignedProvider: schedule.provider, serviceType: schedule.serviceType, status: { $in: activeAppointmentStatuses } });
  if (assigned) return res.status(409).json({ message: "Reassign active appointments before disabling this provider schedule." });
  schedule.isActive = false;
  await schedule.save();
  return res.json(schedule);
}

export async function assignAppointmentProvider(req, res) {
  const { providerId } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, "providerId")) return res.status(400).json({ message: "Choose a provider or explicitly unassign the current provider." });
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID." });
  const current = await Appointment.findById(req.params.id);
  if (!current) return res.status(404).json({ message: "Appointment not found." });
  if (current.status !== "scheduled" || current.decisionStatus !== "accepted") return res.status(409).json({ message: "Only accepted, scheduled appointments can have a provider assigned." });
  if (!PROVIDER_SERVICES.has(current.serviceType)) return res.status(400).json({ message: "This service does not use provider assignment." });

  const update = providerId ? { $set: { assignedProvider: providerId } } : { $unset: { assignedProvider: 1 } };
  if (providerId) {
    if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: "Choose a valid provider." });
    const availability = await findAvailableProviders({ serviceType: current.serviceType, dateKey: current.dateKey, timeSlot: current.timeSlot, excludeAppointmentId: current._id });
    if (!availability.configured) return res.status(409).json({ message: "Configure provider working hours before assigning this appointment." });
    if (!availability.providers.some((provider) => String(provider._id) === providerId)) return res.status(409).json({ message: "That provider is not eligible or is unavailable for this service and time." });
  }

  try {
    const appointment = await Appointment.findOneAndUpdate(
      { _id: current._id, status: "scheduled", decisionStatus: "accepted" },
      update,
      { new: true, runValidators: true }
    ).populate("assignedProvider", "name role");
    if (!appointment) return res.status(409).json({ message: "This appointment has already changed. Refresh and try again." });
    req.app.get("io")?.emit("appointment:update", { _id: appointment._id, assignedProvider: appointment.assignedProvider?._id || null });
    return res.json({ appointment });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "That provider already has an appointment at this time." });
    throw error;
  }
}

export async function createAppointment(req, res) {
  const { studentId, serviceType, purpose, date, timeSlot } = req.body;
  const notificationEmail = String(req.body.notificationEmail || "").trim().toLowerCase();
  if (!SERVICES.has(serviceType) || !(await serviceAllowsDate(serviceType, date)) || date < todayInManila() || !TIMES.has(timeSlot) || !slotIsInFuture(date, timeSlot) || !slotFitsServiceHours(serviceType, timeSlot)) {
    return res.status(400).json({ message: "The selected service, date, or time is invalid." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) {
    return res.status(400).json({ message: "Enter a valid school email address to receive the appointment decision." });
  }
  if (serviceType === "Medical Clearance" && (!purpose || typeof purpose !== "string" || !purpose.trim())) {
    return res.status(400).json({ message: "Select a medical clearance purpose before booking." });
  }

  const student = await Student.findOne({
    $or: [{ studentId }, { rfidTagUid: studentId?.toUpperCase() }],
    isActive: { $ne: false },
  });
  if (!student) return res.status(404).json({ message: "Unknown student." });
  const clearanceRequirement = serviceType === "Medical Clearance"
    ? findClearanceRequirement(student.affiliation, purpose)
    : null;
  if (serviceType === "Medical Clearance" && !clearanceRequirement) {
    return res.status(400).json({ message: "Choose a medical clearance purpose that matches the patient's affiliation." });
  }

  const occupiedAppointments = await Appointment.find({
    serviceType,
    dateKey: date,
    timeSlot,
    status: { $in: activeAppointmentStatuses },
  }).select("slotNumber").lean();
  const occupiedSlots = new Set(occupiedAppointments.map((appointment) => appointment.slotNumber || 1));
  const slotNumbers = Array.from({ length: appointmentCapacity(serviceType) }, (_, index) => index + 1).filter((position) => !occupiedSlots.has(position));
  if (!slotNumbers.length) return res.status(409).json({ message: "That appointment time is no longer available. Please choose another time." });

  try {
    let appointment;
    for (const slotNumber of slotNumbers) {
      try {
        let assignedProvider;
        if (PROVIDER_SERVICES.has(serviceType) && await isProviderSchedulingConfigured(serviceType)) {
          const availability = await findAvailableProviders({ serviceType, dateKey: date, timeSlot });
          if (!availability.providers.length) continue;
          assignedProvider = availability.providers[0]._id;
        }
        appointment = await Appointment.create({
          student: student._id,
          serviceType,
          purpose: clearanceRequirement?.purpose || purpose?.trim(),
          dateKey: date,
          timeSlot,
          slotNumber,
          ...(assignedProvider ? { assignedProvider } : {}),
          notificationEmail,
        });
        break;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const stillOpen = await Appointment.exists({ serviceType, dateKey: date, timeSlot, status: { $in: activeAppointmentStatuses }, slotNumber });
        if (stillOpen) continue;
        if (PROVIDER_SERVICES.has(serviceType)) continue;
        throw error;
      }
    }
    if (!appointment) return res.status(409).json({ message: "That appointment time was just booked. Please choose another available time." });
    student.email = notificationEmail;
    await student.save();
    await appointment.populate("student", "firstName lastName email");
    await appointment.populate("assignedProvider", "name role");
    const notification = await sendAppointmentDecisionNotification(appointment, "pending", notificationEmail);
    req.app.get("io")?.emit("appointment:new", appointment);
    return res.status(201).json({
      appointment,
      notificationSent: Boolean(notification.sent),
      notificationMessage: notification.sent ? undefined : notification.reason || "Appointment saved, but the pending email could not be sent.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That appointment time was just booked. Please choose another available time." });
    }
    throw error;
  }
}

export async function listAppointments(req, res) {
  const parsed = parseAppointmentListFilters(req.query, todayInManila());
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const { from, to, serviceType, decisionStatus, status, search, page } = parsed.filters;
  const limit = 25;
  const conditions = [];
  const dateRange = {};
  if (from) dateRange.$gte = from;
  if (to) dateRange.$lte = to;
  if (Object.keys(dateRange).length) conditions.push({ dateKey: dateRange });
  if (serviceType) conditions.push({ serviceType });
  if (status) conditions.push({ status });
  if (decisionStatus === "pending") {
    conditions.push({ $or: [{ decisionStatus: "pending" }, { decisionStatus: { $exists: false } }] });
  } else if (decisionStatus) {
    conditions.push({ decisionStatus });
  }

  if (search) {
    const searchTerms = search.split(/\s+/).filter(Boolean);
    const studentSearch = searchTerms.map((term) => {
      const regex = { $regex: escapeRegex(term), $options: "i" };
      return { $or: [
        { firstName: regex }, { lastName: regex }, { studentId: regex },
        { employeeId: regex }, { email: regex },
      ] };
    });
    const matchingStudents = await Student.find({ $and: studentSearch }).select("_id");
    const appointmentMatches = [
      { student: { $in: matchingStudents.map(({ _id }) => _id) } },
      { notificationEmail: { $regex: escapeRegex(search), $options: "i" } },
    ];
    if (/^[a-f\d]{24}$/i.test(search)) appointmentMatches.push({ _id: search });
    conditions.push({ $or: appointmentMatches });
  }

  const appointmentFilter = conditions.length ? { $and: conditions } : {};
  const [appointments, total] = await Promise.all([
    Appointment.find(appointmentFilter)
      .populate("student", "studentId employeeId affiliation firstName lastName program department email yearLevel yearLevelOverride")
      .populate("assignedProvider", "name role")
      .sort({ dateKey: 1, timeSlot: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Appointment.countDocuments(appointmentFilter),
  ]);
  const academicYear = await getConfiguredAcademicYear();
  appointments.forEach((appointment) => {
    if (appointment.student) appointment.student = decoratePatientYearLevel(appointment.student, academicYear);
  });
  res.json({ items: appointments, total, page, limit });
}

export async function getAppointment(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID." });
  const appointment = await Appointment.findById(req.params.id)
    .populate("student", "studentId employeeId affiliation firstName lastName program department email yearLevel yearLevelOverride")
    .populate("assignedProvider", "name role")
    .populate("queueEntry", "queueNumber serviceType status createdAt completedAt")
    .populate("checkedInBy", "name");
  if (!appointment) return res.status(404).json({ message: "Appointment not found." });
  appointment.student = decoratePatientYearLevel(appointment.student, await getConfiguredAcademicYear());
  const encounter = appointment.queueEntry
    ? await ConsultationRecord.findOne({ queueEntry: appointment.queueEntry._id }).select("_id visitType visitDate")
    : null;
  const providerSchedule = appointment.assignedProvider
    ? await ProviderSchedule.findOne({ provider: appointment.assignedProvider._id, serviceType: appointment.serviceType, isActive: true }).select("weekdays startTime endTime slotMinutes")
    : null;
  return res.json({ appointment, encounter, providerSchedule });
}

export async function getAppointmentNotifications(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID." });
  const exists = await Appointment.exists({ _id: req.params.id });
  if (!exists) return res.status(404).json({ message: "Appointment not found." });
  const notifications = await AppointmentNotification.find({ appointment: req.params.id })
    .select("type recipient subject status attempts queuedAt attemptedAt sentAt failureReason createdAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return res.json({ items: notifications });
}

export async function retryAppointmentEmail(req, res) {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.notificationId)) {
    return res.status(400).json({ message: "Invalid appointment or notification ID." });
  }
  const appointment = await Appointment.findById(req.params.id).populate("student", "firstName lastName");
  if (!appointment) return res.status(404).json({ message: "Appointment not found." });
  const notification = await AppointmentNotification.findOne({ _id: req.params.notificationId, appointment: appointment._id });
  if (!notification) return res.status(404).json({ message: "Notification record not found." });
  if (notification.status !== "failed") return res.status(409).json({ message: "Only failed appointment emails can be retried." });
  if (notification.attempts >= 4) return res.status(409).json({ message: "This email reached its retry limit. Check the email settings before sending a new notification." });
  const result = await retryAppointmentNotification(appointment, notification);
  const updated = await AppointmentNotification.findById(notification._id)
    .select("type recipient subject status attempts queuedAt attemptedAt sentAt failureReason createdAt");
  if (result.sent) return res.json({ notification: updated });
  return res.status(502).json({ message: result.reason || "The email provider could not send the notification.", notification: updated });
}

export async function checkInAppointment(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID." });
  const io = req.app.get("io");
  const existing = await Appointment.findById(req.params.id)
    .populate("student", "studentId firstName lastName")
    .populate("queueEntry", "queueNumber serviceType status createdAt completedAt")
    .populate("checkedInBy", "name");
  if (!existing) return res.status(404).json({ message: "Appointment not found." });
  const eligibility = checkInEligibility(existing, todayInManila());
  if (eligibility.alreadyCheckedIn) return res.json({ appointment: existing, queueEntry: existing.queueEntry, alreadyCheckedIn: true });
  if (!eligibility.eligible) return res.status(409).json({ message: eligibility.reason });

  const session = await mongoose.startSession();
  let appointment;
  let queueEntry;
  try {
    await session.withTransaction(async () => {
      const current = await Appointment.findOne({ _id: req.params.id, status: "scheduled", decisionStatus: "accepted" }).session(session);
      if (!current) {
        const conflict = new Error("This appointment is no longer eligible for check-in.");
        conflict.appointmentConflict = true;
        throw conflict;
      }
      const checkedInAt = new Date();
      const created = await QueueEntry.create([{
        appointment: current._id,
        student: current.student,
        queueNumber: await nextQueueNumber(current.serviceType, { session }),
        priorityLevel: "Standard Priority",
        serviceType: current.serviceType,
        reason: current.purpose || "Scheduled appointment",
      }], { session });
      queueEntry = created[0];
      if (current.serviceType === "Medical Clearance") {
        const student = await Student.findById(current.student).session(session);
        if (!student) {
          const conflict = new Error("The patient record is unavailable for this clearance.");
          conflict.appointmentConflict = true;
          throw conflict;
        }
        const workflow = createMedicalClearanceWorkflow({ student, purpose: current.purpose, queueEntry: queueEntry._id, actor: req.user.id });
        await workflow.save({ session });
        queueEntry.medicalWorkflow = workflow._id;
        await queueEntry.save({ session });
      }
      appointment = await Appointment.findOneAndUpdate(
        { _id: current._id, status: "scheduled", decisionStatus: "accepted", $or: [{ queueEntry: { $exists: false } }, { queueEntry: null }] },
        { $set: { status: "checked_in", checkedInAt, checkedInBy: req.user.id, queueEntry: queueEntry._id } },
        { new: true, runValidators: true, session }
      );
      if (!appointment) {
        const conflict = new Error("This appointment has already been checked in or changed.");
        conflict.appointmentConflict = true;
        throw conflict;
      }
    });
  } catch (error) {
    if (error.appointmentConflict) {
      const latest = await Appointment.findById(req.params.id)
        .populate("student", "studentId firstName lastName")
        .populate("queueEntry", "queueNumber serviceType status createdAt completedAt")
        .populate("checkedInBy", "name");
      if (latest?.status === "checked_in" && latest.queueEntry) {
        return res.json({ appointment: latest, queueEntry: latest.queueEntry, alreadyCheckedIn: true });
      }
      return res.status(409).json({ message: "This appointment has already changed or is no longer eligible for check-in." });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await appointment.populate("student", "studentId firstName lastName");
  await appointment.populate("queueEntry", "queueNumber serviceType status createdAt completedAt");
  await appointment.populate("checkedInBy", "name");
  io?.to("clinical-queue").to("frontdesk-queue").emit("queue:new", { _id: queueEntry._id });
  io?.emit("appointment:update", { _id: appointment._id, status: appointment.status, queueEntry: queueEntry._id });
  return res.json({ appointment, queueEntry, alreadyCheckedIn: false });
}

export async function updateAppointmentNoShowException(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID." });
  const exempt = req.body?.exempt;
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (typeof exempt !== "boolean") return res.status(400).json({ message: "Choose whether to enable or remove the no-show exception." });
  if (exempt && reason.length < 5) return res.status(400).json({ message: "Enter a reason of at least 5 characters for this exception." });
  const now = new Date();
  const appointment = await Appointment.findOneAndUpdate(
    { _id: req.params.id, status: "scheduled", decisionStatus: "accepted", $or: [{ queueEntry: { $exists: false } }, { queueEntry: null }] },
    {
      $set: exempt
        ? { noShowExempt: true, noShowExemptionReason: reason, noShowExemptionBy: req.user.id, noShowExemptionAt: now }
        : { noShowExempt: false, noShowExemptionReason: "", noShowExemptionBy: req.user.id, noShowExemptionAt: now },
      $push: { statusHistory: { from: "scheduled", to: "scheduled", actor: req.user.id, at: now, reason: exempt ? `No-show exception granted: ${reason}` : "No-show exception removed." } },
    },
    { new: true },
  ).populate("student", "studentId employeeId affiliation firstName lastName program department email").populate("assignedProvider", "name role");
  if (!appointment) return res.status(409).json({ message: "No-show exceptions can only be changed for an accepted appointment that has not been checked in or expired." });
  req.app.get("io")?.emit("appointment:update", { _id: appointment._id, status: appointment.status, noShowExempt: appointment.noShowExempt });
  return res.json({ appointment });
}

export async function updateAppointmentDecision(req, res) {
  const { decisionStatus } = req.body;
  const decisionRemark = String(req.body?.remark || "").trim().slice(0, 1000);
  if (!["accepted", "rejected"].includes(decisionStatus)) {
    return res.status(400).json({ message: "Choose accept or reject for this appointment." });
  }
  if (decisionStatus === "rejected" && decisionRemark.length < 3) return res.status(400).json({ message: "Enter a rejection remark of at least 3 characters." });
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ message: "Invalid appointment ID." });
  }

  const decisionAt = new Date();
  const appointmentUpdate = {
    $set: {
      decisionStatus,
      decisionAt,
      decisionRemark,
      ...(decisionStatus === "rejected" ? { status: "cancelled" } : {}),
    },
    ...(decisionStatus === "rejected" ? { $push: { statusHistory: { from: "scheduled", to: "cancelled", actor: String(req.user.id), at: decisionAt, reason: decisionRemark } } } : {}),
  };
  const appointment = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "scheduled",
      $or: [{ decisionStatus: "pending" }, { decisionStatus: { $exists: false } }],
    },
    appointmentUpdate,
    { new: true, runValidators: true }
  ).populate("student", "studentId firstName lastName email");
  if (!appointment) {
    const exists = await Appointment.exists({ _id: req.params.id });
    return exists
      ? res.status(409).json({ message: "This appointment's decision is already locked, or it is no longer eligible for a decision." })
      : res.status(404).json({ message: "Appointment not found." });
  }

  const notificationEmail = appointment.notificationEmail || appointment.student?.email;
  const notification = notificationEmail
    ? await sendAppointmentDecisionNotification(appointment, decisionStatus, notificationEmail, decisionRemark)
    : { sent: false, reason: "The student has no school email address on file." };
  req.app.get("io")?.emit("appointment:update", { _id: appointment._id, decisionStatus, status: appointment.status });

  return res.json({
    appointment,
    notificationSent: Boolean(notification.sent),
    notificationMessage: notification.sent ? undefined : notification.reason || "Decision saved, but the email could not be sent.",
  });
}
