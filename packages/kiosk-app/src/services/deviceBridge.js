/**
 * Thin client for the local device-bridge WebSocket. The kiosk UI never
 * talks to serial ports directly — it just listens for JSON events like:
 *   { type: "rfid_tap", uid: "04A3B2C1" }
 *   { type: "temperature_reading", celsius: 36.8 }
 *   { type: "height_reading", cm: 170 }
 *   { type: "weight_reading", kg: 62.5 }
 *   { type: "blood_pressure_reading", bloodPressure: "120/80", classification: "..." }
 *
 * In VITE_MOCK_HARDWARE=true mode, this fires believable fake events instead,
 * so the UI/UX can be built and demoed on a laptop with zero hardware.
 */
export function connectDeviceBridge(onEvent) {
  const mock = import.meta.env.VITE_MOCK_HARDWARE === "true";

  if (mock) {
    console.warn("[deviceBridge] MOCK MODE — no real hardware connected");
    return {
      simulateRfidTap: (uid = "MOCKUID001") => onEvent({ type: "rfid_tap", uid }),
      simulateTemperature: (celsius = 36.7) => onEvent({ type: "temperature_reading", celsius }),
      simulateHeightWeight: (cm = 170, kg = 62) => {
        onEvent({ type: "height_reading", cm });
        onEvent({ type: "weight_reading", kg });
      },
      simulateBloodPressure: (bloodPressure = "120/80", classification) =>
        onEvent({ type: "blood_pressure_reading", bloodPressure, classification }),
      close: () => {},
    };
  }

  const url = import.meta.env.VITE_DEVICE_BRIDGE_WS || "ws://localhost:6060";
  console.log("[deviceBridge] connecting to:", url);
  const ws = new WebSocket(url);
  ws.onopen = () => console.log("[deviceBridge] connected to ws server!");
  ws.onmessage = (msg) => {
    console.log("[deviceBridge] raw message received:", msg.data);
    try {
      onEvent(JSON.parse(msg.data));
    } catch (err) {
      console.error("[deviceBridge] bad message", err);
    }
  };
  ws.onerror = (err) => console.error("[deviceBridge] socket error", err);
  ws.onclose = () => console.warn("[deviceBridge] connection closed");
  return { close: () => ws.close() };
}
