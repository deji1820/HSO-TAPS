const SERVICE_TYPES = new Set(["Medical Consultation", "Dental Consultation", "Medical Clearance", "Prescription & Medicine Request"]);
const DECISION_STATUSES = new Set(["pending", "accepted", "rejected"]);
const APPOINTMENT_STATUSES = new Set(["scheduled", "checked_in", "cancelled", "completed", "no_show"]);
const REGEX_META_CHARACTERS = new Set(["\\", ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]"]);

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function optionalString(value) {
  return value == null || value === "" ? "" : typeof value === "string" ? value : null;
}

export function parseAppointmentListFilters(query, today) {
  const fromValue = optionalString(query.from);
  const toValue = optionalString(query.to);
  const serviceType = optionalString(query.serviceType);
  const decisionStatus = optionalString(query.decisionStatus);
  const status = optionalString(query.status);
  const searchValue = optionalString(query.search);
  const pageValue = optionalString(query.page);

  if ([fromValue, toValue, serviceType, decisionStatus, status, searchValue, pageValue].includes(null)) {
    return { error: "Appointment filters must be single text values." };
  }
  const page = pageValue ? Number(pageValue) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return { error: "Choose a valid appointment page." };
  if ((fromValue && !isDateKey(fromValue)) || (toValue && !isDateKey(toValue))) {
    return { error: "Use valid dates for the appointment date range." };
  }
  if (fromValue && toValue && fromValue > toValue) {
    return { error: "The start date must be on or before the end date." };
  }
  if (serviceType && !SERVICE_TYPES.has(serviceType)) return { error: "Choose a valid appointment service." };
  if (decisionStatus && !DECISION_STATUSES.has(decisionStatus)) return { error: "Choose a valid appointment decision." };
  if (status && !APPOINTMENT_STATUSES.has(status)) return { error: "Choose a valid appointment status." };

  return {
    filters: {
      from: fromValue || (toValue ? "" : today),
      to: toValue,
      serviceType,
      decisionStatus,
      status,
      search: searchValue.trim().slice(0, 100),
      page,
    },
  };
}

export function escapeRegex(value) {
  const slash = String.fromCharCode(92);
  return [...value].map((character) => REGEX_META_CHARACTERS.has(character) ? `${slash}${character}` : character).join("");
}
