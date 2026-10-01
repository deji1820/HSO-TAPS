import { io } from "socket.io-client";

// Single shared socket for live queue updates on the Dashboard page.
const socketUrl = import.meta.env.VITE_SOCKET_URL || new URL(import.meta.env.VITE_API_URL || "http://localhost:5000/api").origin;
export const socket = io(socketUrl, { autoConnect: false });
