import Appointment from "../models/Appointment.js";
import ProviderSchedule from "../models/ProviderSchedule.js";
import { CLEARANCE_WEEKDAYS, LEGACY_SERVICE_WEEKDAYS, PROVIDER_SERVICES, providerRoleMatches, slotFitsSchedule } from "./providerAvailability.js";

export async function isProviderSchedulingConfigured(serviceType) {
  if (!PROVIDER_SERVICES.has(serviceType)) return false;
  return Boolean(await ProviderSchedule.exists({ serviceType }));
}

export async function getAppointmentWeekdays(serviceType) {
  if (serviceType === "Medical Clearance") return { weekdays: CLEARANCE_WEEKDAYS, timeWindows: [{ startTime: "08:00", endTime: "21:00" }], legacyFallback: true };
  if (!PROVIDER_SERVICES.has(serviceType)) return null;
  const configured = await isProviderSchedulingConfigured(serviceType);
  if (!configured) return { weekdays: LEGACY_SERVICE_WEEKDAYS[serviceType], timeWindows: [{ startTime: "08:00", endTime: "21:00" }], legacyFallback: true };
  const rules = await ProviderSchedule.find({ serviceType, isActive: true }).populate("provider", "name role");
  const eligibleRules = rules.filter((rule) => rule.provider && providerRoleMatches(serviceType, rule.provider.role));
  const weekdays = [...new Set(eligibleRules.flatMap((rule) => rule.weekdays))].sort();
  const timeWindows = [...new Set(eligibleRules.map((rule) => `${rule.startTime}-${rule.endTime}`))].sort().map((window) => {
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
  const rules = await ProviderSchedule.find({ serviceType, weekdays: weekday, isActive: true }).populate("provider", "name role");
  const scheduled = rules.filter((rule) => rule.provider && providerRoleMatches(serviceType, rule.provider.role) && slotFitsSchedule(timeSlot, rule));
  if (!scheduled.length) return { configured: true, providers: [] };

  const providerIds = [...new Set(scheduled.map((rule) => String(rule.provider._id)))];
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
    providers: scheduled
      .map((rule) => rule.provider)
      .filter((provider, index, all) => !busyIds.has(String(provider._id)) && all.findIndex((item) => String(item._id) === String(provider._id)) === index)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
