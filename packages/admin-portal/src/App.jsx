import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import EMRPage from "./pages/EMRPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import FormsPage from "./pages/FormsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import AppointmentsPage from "./pages/AppointmentsPage.jsx";
import ControlCenterPage from "./pages/ControlCenterPage.jsx";
import NewMedicalRecordPage from "./pages/NewMedicalRecordPage.jsx";
import { normalizeRole } from "./utils/roles.js";
import MedicalDocumentsPage from "./pages/MedicalDocumentsPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";

function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ user, allowed, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return allowed.includes(normalizeRole(user.role)) ? children : <Navigate to="/" replace />;
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
          <RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist", "staff"]}>
            <EMRPage />
          </RoleRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <RoleRoute user={user} allowed={["nurse", "supervisor", "physician", "dentist", "staff"]}>
            <AppointmentsPage />
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
      {user ? (
        <Layout user={user} onLogout={handleLogout}>
          {routes}
        </Layout>
      ) : (
        routes
      )}
    </BrowserRouter>
  );
}
