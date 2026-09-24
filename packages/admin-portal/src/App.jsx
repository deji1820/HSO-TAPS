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

function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
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
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/emr"
        element={
          <ProtectedRoute user={user}>
            <EMRPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute user={user}>
            <AppointmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute user={user}>
            <AnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/forms"
        element={
          <ProtectedRoute user={user}>
            <FormsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute user={user}>
            <AdminPage />
          </ProtectedRoute>
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
