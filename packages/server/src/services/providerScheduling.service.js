import Appointment from "../models/Appointment.js";
import ProviderSchedule from "../models/ProviderSchedule.js";
import User from "../models/User.js";
import { CLEARANCE_WEEKDAYS, LEGACY_SERVICE_WEEKDAYS, PROVIDER_SERVICES, SCHEDULE_SERVICES, providerRoleMatches, slotFitsSchedule } from "./providerAvailability.js";

export async function isProviderSchedulingConfigured(serviceType) {
  if (!PROVIDER_SERVICES.has(serviceType)) return false;
  if (["Medical Clearance", "Prescription & Medicine Request"].includes(serviceType)) return Boolean(await User.exists({ role: "nurse" }));
  return SCHEDULE_SERVICES.has(serviceType) && Boolean(await ProviderSchedule.exists({ serviceType }));
}

export async function getAppointmentWeekdays(serviceType) {
  const latestClose = ["Medical Consultation", "Dental Consultation"].includes(serviceType) ? "16:00" : "21:00";
  const defaultWindow = { startTime: "08:00", endTime: latestClose };
  if (["Medical Clearance", "Prescription & Medicine Request"].includes(serviceType)) return { weekdays: CLEARANCE_WEEKDAYS, timeWindows: [defaultWindow], legacyFallback: true };
  if (!PROVIDER_SERVICES.has(serviceType)) return null;
  const configured = await isProviderSchedulingConfigured(serviceType);
  if (!configured) return { weekdays: LEGACY_SERVICE_WEEKDAYS[serviceType], timeWindows: [defaultWindow], legacyFallback: true };
  const rules = await ProviderSchedule.find({ serviceType, isActive: true }).populate("provider", "name role");
  const eligibleRules = rules.filter((rule) => rule.provider && providerRoleMatches(serviceType, rule.provider.role));
  const weekdays = [...new Set(eligibleRules.flatMap((rule) => rule.weekdays))].sort();
  const timeWindows = [...new Set(eligibleRules.map((rule) => {
    const startTime = rule.startTime < defaultWindow.startTime ? defaultWindow.startTime : rule.startTime;
    const endTime = rule.endTime > defaultWindow.endTime ? defaultWindow.endTime : rule.endTime;
    return startTime < endTime ? `${startTime}-${endTime}` : "";
  }).filter(Boolean))].sort().map((window) => {
    const [startTime, endTime] = window.split("-");
    return { startTime, endTime };
  });
  return { weekdays, timeWindows, legacyFallback: false };
}

export async function findAvailableProviders({ serviceType, dateKey, timeSlot, excludeAppointmentId }) {
  if (!PROVIDER_SERVICES.has(serviceType)) return { configured: false, providers: [] };
  const configured = await isProviderSchedulingConfigured(serviceType);
  if (!configured) return { configured: false, providers: [] };

  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  let scheduledProviders;
  if (["Medical Clearance", "Prescription & Medicine Request"].includes(serviceType)) {
    const nurses = await User.find({ role: "nurse" }).select("name role").sort({ name: 1 });
    scheduledProviders = nurses;
  } else {
    const rules = await ProviderSchedule.find({ serviceType, weekdays: weekday, isActive: true }).populate("provider", "name role");
    scheduledProviders = rules.filter((rule) => rule.provider && providerRoleMatches(serviceType, rule.provider.role) && slotFitsSchedule(timeSlot, rule)).map((rule) => rule.provider);
  }
  if (!scheduledProviders.length) return { configured: true, providers: [] };

  const providerIds = [...new Set(scheduledProviders.map((provider) => String(provider._id)))];
  const busyQuery = {
    dateKey,
    timeSlot,
    status: { $in: ["scheduled", "checked_in"] },
    assignedProvider: { $in: providerIds },
  };
  if (excludeAppointmentId) busyQuery._id = { $ne: excludeAppointmentId };
  const busy = await Appointment.find(busyQuery).select("assignedProvider -_id").lean();
  const busyIds = new Set(busy.map(({ assignedProvider }) => String(assignedProvider)));
  return {
    configured: true,
    providers: scheduledProviders
      .filter((provider, index, all) => !busyIds.has(String(provider._id)) && all.findIndex((item) => String(item._id) === String(provider._id)) === index)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
