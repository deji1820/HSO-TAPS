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
export const getQuickScreeningAlerts = () => api.get("/queue/screening-alerts").then((r) => r.data);
export const getQueueHistory = ({ from = "", to = "", page = 1 } = {}) =>
  api.get("/queue/history", { params: { from: from || undefined, to: to || undefined, page } }).then((r) => r.data);
export const getQueueBoard = () => api.get("/queue/board").then((r) => r.data);
export const getAppointments = (filters = {}) => api.get("/appointments", { params: filters }).then((r) => r.data);
export const getAppointment = (id) => api.get(`/appointments/${encodeURIComponent(id)}`).then((r) => r.data);
export const getClearanceRequirements = () => api.get("/appointments/clearance-requirements").then((r) => r.data);
export const getAppointmentNotifications = (id) => api.get(`/appointments/${encodeURIComponent(id)}/notifications`).then((r) => r.data);
export const retryAppointmentEmail = (id, notificationId) => api.post(`/appointments/${encodeURIComponent(id)}/notifications/${encodeURIComponent(notificationId)}/retry`).then((r) => r.data);
export const getProviderOptions = (params = {}) => api.get("/appointments/provider-options", { params }).then((r) => r.data);
export const getProviderSchedules = () => api.get("/appointments/provider-schedules").then((r) => r.data);
export const saveProviderSchedule = (payload) => api.put("/appointments/provider-schedules", payload).then((r) => r.data);
export const disableProviderSchedule = (id) => api.patch(`/appointments/provider-schedules/${encodeURIComponent(id)}/disable`).then((r) => r.data);
export const assignAppointmentProvider = (id, providerId) => api.patch(`/appointments/${encodeURIComponent(id)}/provider`, { providerId }).then((r) => r.data);
export const checkInAppointment = (id) => api.post(`/appointments/${encodeURIComponent(id)}/check-in`).then((r) => r.data);
export const updateAppointmentDecision = (id, decisionStatus) => api.patch("/appointments/" + id + "/decision", { decisionStatus }).then((r) => r.data);
export const updateAppointmentNoShowException = (id, exempt, reason = "") => api.patch(`/appointments/${encodeURIComponent(id)}/no-show-exemption`, { exempt, reason }).then((r) => r.data);
export const updateQueueStatus = (id, status, details = {}) => api.patch(`/queue/${id}/status`, { status, ...details }).then((r) => r.data);
export const updateQueueExpirationExemption = (id, exempt, reason = "") => api.patch(`/queue/${encodeURIComponent(id)}/expiration-exemption`, { exempt, reason }).then((r) => r.data);
export const completeSession = (payload) => api.post("/consultations", payload).then((r) => r.data);
export const saveMedicalProfile = (id, payload) => api.post(`/students/${id}/medical-profiles`, payload).then((r) => r.data);
export const startMedicalWorkflow = (id, payload) => api.post(`/students/${id}/medical-workflows`, payload).then((r) => r.data);
export const getMedicalWorkflows = () => api.get("/medical-workflows").then((r) => r.data);
export const getMedicalWorkflow = (id) => api.get(`/medical-workflows/${encodeURIComponent(id)}`).then((r) => r.data);
export const saveClearanceAssessment = (id, assessment) => api.post(`/medical-workflows/${encodeURIComponent(id)}/assessment`, { assessment }).then((r) => r.data);
export const updateWorkflowRequirement = (id, index, payload) => api.patch(`/medical-workflows/${encodeURIComponent(id)}/requirements/${index}`, payload).then((r) => r.data);
export const approveClearanceWorkflow = (id, providerStatement) => api.post(`/medical-workflows/${encodeURIComponent(id)}/approve`, { providerStatement }).then((r) => r.data);
export const getClearanceCertificate = (id) => api.get(`/medical-workflows/${encodeURIComponent(id)}/certificate`).then((r) => r.data);
export const getMedicalProfiles = (id) => api.get(`/students/${id}/medical-profiles`).then((r) => r.data);
export const updateMedicalProfile = (id, payload) => api.put(`/medical-profiles/${id}`, payload).then((r) => r.data);
export const getPatientHistory = (id) => api.get(`/students/${id}/history`).then((r) => r.data);
export const savePatientHistory = (id, payload) => api.put(`/students/${id}/history`, payload).then((r) => r.data);
export const uploadMedicalDocument = (id, payload) => api.post(`/students/${id}/documents`, payload).then((r) => r.data);
export const getMedicalDocuments = () => api.get("/documents").then((r) => r.data);
export const updateMedicalDocumentStatus = (id, status, remarks) => api.patch(`/documents/${id}/status`, { status, remarks }).then((r) => r.data);
export const updateHealthDeclaration = (id, declaration) => api.patch(`/documents/${encodeURIComponent(id)}/health-declaration`, { declaration }).then((r) => r.data);
export const getMedicalDocumentFile = (id) => api.get(`/documents/${id}/file`, { responseType: "blob" }).then((r) => r.data);
export const getAnnouncement = () => api.get("/announcement").then((r) => r.data);
export const saveAnnouncement = (text) => api.put("/announcement", { text }).then((r) => r.data);
export const getInventory = () => api.get("/inventory").then((r) => r.data);
export const createInventoryItem = (payload) => api.post("/inventory", payload).then((r) => r.data);
export const updateInventoryItem = (id, payload) => api.patch(`/inventory/${id}`, payload).then((r) => r.data);
export const deleteInventoryItem = (id) => api.delete(`/inventory/${id}`).then((r) => r.data);
export const getStudents = (q) => api.get("/students", { params: { q } }).then((r) => r.data);
export const getFullEmr = (id) => api.get(`/students/${id}/emr`).then((r) => r.data);
export const bulkUpload = (rows, mode) => api.post("/students/bulk-upload", { rows, mode }).then((r) => r.data);
export const getRosterRecord = (personId) => api.get(`/students/roster/${encodeURIComponent(personId)}`).then((r) => r.data);
export const getAcademicCalendar = () => api.get("/students/academic-calendar").then((r) => r.data);
export const updateAcademicCalendar = (currentAcademicYear) => api.patch("/students/academic-calendar", { currentAcademicYear }).then((r) => r.data);
export const updateYearLevelOverride = (personId, yearLevelOverride, reason = "") => api.patch(`/students/roster/${encodeURIComponent(personId)}/year-level-override`, { yearLevelOverride, reason }).then((r) => r.data);
export const resetRosterRfid = (personId) => api.patch(`/students/roster/${encodeURIComponent(personId)}/rfid`).then((r) => r.data);
export const resetRosterProfile = (personId) => api.patch(`/students/roster/${encodeURIComponent(personId)}/reset-profile`).then((r) => r.data);
export const archiveRosterRecord = (personId) => api.patch(`/students/roster/${encodeURIComponent(personId)}/archive`).then((r) => r.data);
export const restoreRosterRecord = (personId) => api.patch(`/students/roster/${encodeURIComponent(personId)}/restore`).then((r) => r.data);
export const deleteRosterRecord = (personId) => api.delete(`/students/roster/${encodeURIComponent(personId)}`).then((r) => r.data);
export const getFormPipelines = () => api.get("/forms").then((r) => r.data);
export const getSyncLog = () => api.get("/forms/sync-log").then((r) => r.data);
export const getAnalyticsSummary = (days) => api.get("/analytics/summary", { params: { days } }).then((r) => r.data);
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const isLoginRequest = /\/auth\/login\/?$/.test(requestUrl);
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem("hsotap_token");
      localStorage.removeItem("hsotap_user");
      if (window.location.pathname !== "/login") {
        window.location.replace("/login?session=expired");
      }
    }
    return Promise.reject(error);
  }
);
