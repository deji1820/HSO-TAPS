import axios from "axios";

let rawUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
if (rawUrl.endsWith("/")) rawUrl = rawUrl.slice(0, -1);
if (!rawUrl.endsWith("/api")) rawUrl = `${rawUrl}/api`;

export const api = axios.create({
  baseURL: rawUrl,
  headers: { "x-kiosk-key": import.meta.env.VITE_KIOSK_API_KEY || "hsotap-kiosk-secret-key-2026" },
});

export const lookupStudent = (studentId, config) => api.get(`/students/lookup/${studentId}`, config).then((r) => r.data);

export const submitIntake = (payload) => api.post("/kiosk/intake", payload).then((r) => r.data);

export const getAppointmentAvailability = (serviceType, date) =>
  api.get("/appointments/availability", { params: { serviceType, date } }).then((r) => r.data);

export const createAppointment = (payload) =>
  api.post("/appointments", payload).then((r) => r.data);

export const submitKioskDocument = (payload) =>
  api.post("/kiosk/documents", payload).then((r) => r.data);
