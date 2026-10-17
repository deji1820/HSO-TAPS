import jwt from "jsonwebtoken";

/**
 * Wires Socket.IO for the Live Nurse/Doctor Dashboard.
 * kiosk.controller.js emits "queue:new"; staff clients listen for it
 * and for "queue:update" (called / in_session / completed transitions).
 */
export function initQueueSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      const role = String(user.role || "").toLowerCase();
      if (!["nurse", "supervisor", "physician", "doctor", "dentist", "staff"].includes(role)) {
        return next(new Error("You do not have access to the queue"));
      }
      socket.data.user = user;
      socket.data.role = role;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const clinicalRole = ["nurse", "supervisor", "physician", "doctor", "dentist"].includes(socket.data.role);
    socket.join(clinicalRole ? "clinical-queue" : "frontdesk-queue");
    console.log(`[socket] client connected: ${socket.id}`);
    socket.on("disconnect", () => console.log(`[socket] client disconnected: ${socket.id}`));
  });
}
