import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/api.js";
import "../styles/pages/Login.css";

const eyeOpen = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const eyeClosed = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 3l18 18" strokeLinecap="round" />
    <path d="M10.6 5.2A11.6 11.6 0 0 1 12 5c7 0 11 7 11 7a17.6 17.6 0 0 1-3.4 4.2M6.5 6.6C3.7 8.3 1 12 1 12s4 7 11 7c1.4 0 2.7-.2 3.9-.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const campuses = [
  "NU Manila", "NU Nazareth School", "NU Laguna", "NU Mall of Asia",
  "NU Fairview", "NU Baliwag", "NU Dasmariñas", "NU Lipa", "NU Clark",
  "NU East Ortigas", "NU Bacolod", "NU Cebu", "NU Las Piñas", "NU Davao",
];

export default function LoginPage({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      localStorage.setItem("hsotap_token", token);
      localStorage.setItem("hsotap_user", JSON.stringify(user));
      onLoggedIn(user);
      navigate("/");
    } catch (err) {
      setError(
        err.response?.status === 401
          ? "Invalid email or password."
          : "Could not reach the server. Is it running?"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-brand" aria-label="National University">
        <img className="login-brand-crest" src="/assets/nu-crest.png" alt="National University crest" />
        <div className="login-brand-wordmark">
          <h2>NATIONAL<br />UNIVERSITY</h2>
          <span className="login-brand-rule" />
          <p>Education that works.</p>
        </div>
      </section>

      <main className="login-card">
        <h1>Login</h1>
        <p>Welcome to NU Fairview Health Services Office<br />Clinic Management System</p>
        <form onSubmit={handleSubmit}>
          <label className="login-input-wrap" htmlFor="login-email">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" /></svg>
            <input
              id="login-email"
              type="email"
              placeholder="Email Address"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="login-input-wrap" htmlFor="login-password">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? eyeOpen : eyeClosed}
            </button>
          </label>
          <a href="#" className="forgot-password" onClick={(e) => e.preventDefault()}>
            Forgot Password
          </a>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>
      </main>

      <aside className="login-campuses" aria-label="National University campuses">
        <ul>{campuses.map((campus) => <li key={campus}>{campus}</li>)}</ul>
      </aside>
    </div>
  );
}
