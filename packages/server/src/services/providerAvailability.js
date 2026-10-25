export const PROVIDER_SERVICES = new Set(["Medical Consultation", "Dental Consultation"]);
export const LEGACY_SERVICE_WEEKDAYS = {
  "Medical Consultation": [1, 2, 3, 4, 5],
  "Dental Consultation": [3, 5],
};
export const CLEARANCE_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export function providerRoleMatches(serviceType, role) {
  const normalizedRole = String(role || "").toLowerCase();
  return serviceType === "Dental Consultation"
    ? normalizedRole === "dentist"
    : serviceType === "Medical Consultation" && ["physician", "doctor"].includes(normalizedRole);
}

export function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(String(value || ""));
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  return hour * 60 + minute;
}

export function slotFitsSchedule(timeSlot, schedule) {
  const slotStart = timeToMinutes(timeSlot);
  if (slotStart === null) return false;
  const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return slotStart >= start && slotStart + (schedule.slotMinutes || 30) <= end;
}

export function validWeekdays(weekdays) {
  return Array.isArray(weekdays) && weekdays.length > 0
    && weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 6)
    && new Set(weekdays).size === weekdays.length;
}
