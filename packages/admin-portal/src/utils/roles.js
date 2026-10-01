export function normalizeRole(role) {
  const value = String(role || "nurse").toLowerCase();
  if (value === "admin" || value === "super_admin") return "superadmin";
  if (value === "doctor") return "physician";
  return value;
}

export const isClinicalProvider = (role) => ["physician", "dentist"].includes(normalizeRole(role));
