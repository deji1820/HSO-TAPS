import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import studentsRoutes from "./routes/students.routes.js";
import kioskRoutes from "./routes/kiosk.routes.js";
import queueRoutes from "./routes/queue.routes.js";
import formsRoutes from "./routes/forms.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";

export function createApp() {
  const app = express();

  const rawOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = !rawOrigin || rawOrigin === "*" 
    ? "*" 
    : rawOrigin.split(",").map((s) => s.trim()).filter(Boolean);

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/students", studentsRoutes);
  app.use("/api/kiosk", kioskRoutes);
  app.use("/api/queue", queueRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/forms", formsRoutes);
  app.use("/api/analytics", analyticsRoutes);

  return app;
}
