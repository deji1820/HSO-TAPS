import axios from "axios";

let rawUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
if (rawUrl.endsWith("/")) rawUrl = rawUrl.slice(0, -1);
if (!rawUrl.endsWith("/api")) rawUrl = `${rawUrl}/api`;

export const api = axios.create({ baseURL: rawUrl });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hsotap_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const login = (email, password) => api.post("/auth/login", { email, password }).then((r) => r.data);
export const getQueue = () => api.get("/queue").then((r) => r.data);
export const getAppointments = () => api.get("/appointments").then((r) => r.data);
export const updateQueueStatus = (id, status) => api.patch(`/queue/${id}/status`, { status }).then((r) => r.data);
export const completeSession = (payload) => api.post("/consultations", payload).then((r) => r.data);
export const getStudents = (q) => api.get("/students", { params: { q } }).then((r) => r.data);
export const getFullEmr = (id) => api.get(`/students/${id}/emr`).then((r) => r.data);
export const bulkUpload = (rows, mode) => api.post("/students/bulk-upload", { rows, mode }).then((r) => r.data);
export const getFormPipelines = () => api.get("/forms").then((r) => r.data);
export const getSyncLog = () => api.get("/forms/sync-log").then((r) => r.data);
export const getAnalyticsSummary = (days) => api.get("/analytics/summary", { params: { days } }).then((r) => r.data);
