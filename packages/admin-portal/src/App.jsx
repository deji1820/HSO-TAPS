import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import EMRPage from "./pages/EMRPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import FormsPage from "./pages/FormsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import AppointmentsPage from "./pages/AppointmentsPage.jsx";
import AppointmentDetailsPage from "./pages/AppointmentDetailsPage.jsx";
import ProviderSchedulesPage from "./pages/ProviderSchedulesPage.jsx";
import ControlCenterPage from "./pages/ControlCenterPage.jsx";
import NewMedicalRecordPage from "./pages/NewMedicalRecordPage.jsx";
import { normalizeRole } from "./utils/roles.js";
import MedicalDocumentsPage from "./pages/MedicalDocumentsPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import QueueBoardPage from "./pages/QueueBoardPage.jsx";

function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ user, allowed, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return allowed.includes(normalizeRole(user.role)) ? children : <Navigate to="/" replace />;
}

function AppShell({ user, onLogout, routes }) {
  const location = useLocation();
  const onQueueBoard = location.pathname.replace(/\/+$/, "") === "/queue-board";
  if (onQueueBoard) return <QueueBoardPage />;
  return user ? <Layout user={user} onLogout={onLogout}>{routes}</Layout> : routes;
}

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("hsotap_user");
    return stored ? JSON.parse(stored) : null;
  });

  function handleLogout() {
    localStorage.removeItem("hsotap_token");
    localStorage.removeItem("hsotap_user");
    setUser(null);
  }

  const routes = (
    <Routes>
      <Route path="/login" element={<LoginPage onLoggedIn={setUser} />} />
      <Route
        path="/"
        element={
          <ProtectedRoute user={user}>
            <ControlCenterPage user={user} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist", "staff"]}>
            <DashboardPage />
          </RoleRoute>
        }
      />
      <Route
        path="/new-record"
        element={
          <RoleRoute user={user} allowed={["nurse", "supervisor"]}>
            <NewMedicalRecordPage />
          </RoleRoute>
        }
      />
      <Route
        path="/emr"
        element={
          <RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist", "superadmin"]}>
            <EMRPage />
          </RoleRoute>
        }
      />
      <Route
        path="/appointments/:appointmentId"
        element={<RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist", "staff"]}><AppointmentDetailsPage user={user} /></RoleRoute>}
      />
      <Route path="/appointment-schedules" element={<RoleRoute user={user} allowed={["supervisor"]}><ProviderSchedulesPage /></RoleRoute>} />
      <Route
        path="/appointments"
        element={
          <RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist", "staff"]}>
            <AppointmentsPage user={user} />
          </RoleRoute>
        }
      />
      <Route path="/medical-documents" element={<RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist"]}><MedicalDocumentsPage /></RoleRoute>} />
      <Route path="/inventory" element={<RoleRoute user={user} allowed={["nurse", "supervisor"]}><InventoryPage /></RoleRoute>} />
      <Route
        path="/analytics"
        element={
          <RoleRoute user={user} allowed={["supervisor"]}>
            <AnalyticsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/forms"
        element={
          <RoleRoute user={user} allowed={["superadmin"]}>
            <FormsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <RoleRoute user={user} allowed={["superadmin"]}>
            <AdminPage />
          </RoleRoute>
        }
      />
    </Routes>
  );

  return (
    <BrowserRouter>
      <AppShell user={user} onLogout={handleLogout} routes={routes} />
    </BrowserRouter>
  );
}
