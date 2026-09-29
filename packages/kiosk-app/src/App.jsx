import { useEffect, useRef, useState } from "react";
import WelcomeScreen from "./screens/WelcomeScreen.jsx";
import ManualEntryScreen from "./screens/ManualEntryScreen.jsx";
import IdentityVerificationScreen from "./screens/IdentityVerificationScreen.jsx";
import ServiceSelectScreen from "./screens/ServiceSelectScreen.jsx";
import ConsultationTypeScreen from "./screens/ConsultationTypeScreen.jsx";
import OtherServicesTypeScreen from "./screens/OtherServicesTypeScreen.jsx";
import RequestTextScreen from "./screens/RequestTextScreen.jsx";
import CheckedInScreen from "./screens/CheckedInScreen.jsx";
import ScreeningOptionsScreen from "./screens/ScreeningOptionsScreen.jsx";
import VitalsEntryScreen from "./screens/VitalsEntryScreen.jsx";
import CapturingScreen from "./screens/CapturingScreen.jsx";
import ResultScreen from "./screens/ResultScreen.jsx";
import OfflineScreen from "./screens/OfflineScreen.jsx";
import { connectDeviceBridge } from "./services/deviceBridge.js";
import { supabase } from "./services/supabase.js";
import { lookupStudent, submitIntake, createAppointment } from "./services/api.js";
import { startHealthMonitor } from "./services/healthCheck.js";
import ConsultationEntryScreen from "./screens/ConsultationEntryScreen.jsx";
import AppointmentBookingScreen from "./screens/AppointmentBookingScreen.jsx";
import AppointmentConfirmedScreen from "./screens/AppointmentConfirmedScreen.jsx";
import WalkInIntakeScreen, { COMPLAINTS, classifyTemp } from "./screens/WalkInIntakeScreen.jsx";
import WalkInResultScreen from "./screens/WalkInResultScreen.jsx";
import ClearanceEntryScreen from "./screens/ClearanceEntryScreen.jsx";
import ClearanceIntakeScreen from "./screens/ClearanceIntakeScreen.jsx";
import ClearanceResultScreen from "./screens/ClearanceResultScreen.jsx";
import PrescriptionIntakeScreen from "./screens/PrescriptionIntakeScreen.jsx";
import ScreeningReadingsScreen from "./screens/ScreeningReadingsScreen.jsx";

const IDLE_TIMEOUT_MS = 30_000;

/**
 * Classifies blood pressure based on systolic / diastolic values.
 * Follows AHA / JNC guidelines (2017).
 */
export function classifyBP(systolic, diastolic) {
  const s = Number(systolic);
  const d = Number(diastolic);
  if (!s || !d || isNaN(s) || isNaN(d)) return null;
  if (s < 90 || d < 60)              return "Low (Hypotension)";
  if (s < 120 && d < 80)             return "Normal";
  if (s < 130 && d < 80)             return "Elevated";
  if (s < 140 || d < 90)             return "Stage 1 Hypertension";
  if (s < 180 || d < 120)            return "Stage 2 Hypertension";
  return "Hypertensive Crisis";
}
const isMock = import.meta.env.VITE_MOCK_HARDWARE === "true";

// Which readings each screening mode needs before we can move to the result screen
const REQUIRED_FIELDS = {
  complete: ["temperatureC", "heightCm", "weightKg"],
  temperature: ["temperatureC"],
  bloodPressure: ["bloodPressure"],
  physical: ["heightCm", "weightKg"],
  bmi: ["heightCm", "weightKg"],
};

export default function App() {
  const [step, setStep] = useState("welcome");
  const [student, setStudent] = useState(null);
  const [captureMode, setCaptureMode] = useState(null); // "complete" | "temperature" | "physical"
  const [readings, setReadings] = useState({});
  const [manualFields, setManualFields] = useState([]); // Array of keys entered manually
  const [overrideTriggered, setOverrideTriggered] = useState(false);
  const [resultQueueNumber, setResultQueueNumber] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [sensorFailed, setSensorFailed] = useState(false);
  const [bpNoReading, setBpNoReading] = useState(false); // true when no bp_logged row was found in Supabase
  const [bpWaiting, setBpWaiting] = useState(false); // true while actively polling Supabase for a BP reading

  // Which multi-step flow is currently in progress Ã¢â‚¬â€ determines what
  // finishCapture() submits and where it routes afterwards.
  const [flowType, setFlowType] = useState(null);
  const [consultSubType, setConsultSubType] = useState(null); // "Medical" | "Dental"
  const [otherServiceSubType, setOtherServiceSubType] = useState(null); // "Prescription/OTC" | "General Inquiry"
  const [checkInInfo, setCheckInInfo] = useState(null); // shown on CheckedInScreen
  const [appointmentSelection, setAppointmentSelection] = useState(null);
  const [clearanceAppointmentPurpose, setClearanceAppointmentPurpose] = useState(null);
  const [clearanceQueueNumber, setClearanceQueueNumber] = useState(null);
  const [walkInComplaints, setWalkInComplaints] = useState([]); // array of complaint keys
  const [medicineSymptoms, setMedicineSymptoms] = useState([]);
  const [medicineSafetyAnswers, setMedicineSafetyAnswers] = useState({});

  const bridgeRef = useRef(null);
  const deviceEventHandlerRef = useRef(null);
  const idleTimer = useRef(null);
  const captureTimerRef = useRef(null);
  const stepRef = useRef(step);
  const submittingRef = useRef(false); // guards against double-submit
  const currentSessionIdRef = useRef(null);
  const bpPollAbortRef = useRef(false); // set to true to cancel an in-progress BP polling loop

  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    bridgeRef.current = connectDeviceBridge((event) => deviceEventHandlerRef.current?.(event));
    return () => {
      bridgeRef.current?.close();
      bridgeRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Supabase Real-time listener for wireless ESP32 RFID taps and sensor triggers
    const channel = supabase
      .channel("hsotap_kiosk_sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kiosk_sessions" },
        async (payload) => {
          console.log("[Supabase Realtime] Session inserted:", payload.new);
          if (payload.new?.rfid_uid && payload.new?.status === "tap_logged") {
            if (payload.new?.id) {
              currentSessionIdRef.current = payload.new.id;
            }
            const rfid = payload.new.rfid_uid;
            try {
              const found = await lookupStudent(rfid);
              if (found) {
                setStudent(found);
                setStep("confirm");
                return;
              }
            } catch (e) {
              console.warn("[Supabase] Student lookup via API failed, using registered student fallback for:", rfid);
            }

            // Client-side fallback mapping for demo/offline resilience
            const fallbackStudents = {
              "579D1D3F": { studentId: "2023-330049", firstName: "Djanaisah M.", lastName: "Benito", sex: "Female", age: 21, schoolYear: "2026-2027", guardianContact: "09171234567", program: "BS Information Technology", yearLevel: "3rd Year", rfidTagUid: "579D1D3F" },
              "EADF614C": { studentId: "2023-132138", firstName: "Sean Gerome F.", lastName: "Recto", sex: "Male", age: 21, schoolYear: "2026-2027", guardianContact: "09171234567", program: "BS Information Technology", yearLevel: "3rd Year", rfidTagUid: "EADF614C" },
              "873A325A": { studentId: "2023-330059", firstName: "Wilpingston M.", lastName: "Lagunay", sex: "Male", age: 21, schoolYear: "2026-2027", guardianContact: "09171234567", program: "BS Information Technology", yearLevel: "3rd Year", rfidTagUid: "873A325A" },
              "87F8113F": { studentId: "2023-330069", firstName: "Carlos Angello J.", lastName: "Bernardo", sex: "Male", age: 21, schoolYear: "2026-2027", guardianContact: "09171234567", program: "BS Information Technology", yearLevel: "3rd Year", rfidTagUid: "87F8113F" },
              "6757805A": { studentId: "2023-230083", firstName: "Delfin Joseph D.", lastName: "Feleo", sex: "Male", age: 21, schoolYear: "2026-2027", guardianContact: "09171234567", program: "BS Information Technology", yearLevel: "3rd Year", rfidTagUid: "6757805A" },
              "B3432B38": { studentId: "2024-100123", firstName: "Maria", lastName: "Santos", sex: "Female", age: 20, schoolYear: "2026-2027", guardianContact: "09179998888", program: "BS Information Technology", yearLevel: "2nd Year", rfidTagUid: "B3432B38" },
              "17F7C664": { studentId: "2024-888999", firstName: "Juan", lastName: "Dela Cruz", sex: "Male", age: 21, schoolYear: "2026-2027", guardianContact: "09175554444", program: "BS Information Technology", yearLevel: "3rd Year", rfidTagUid: "17F7C664" },
            };
            const studentData = fallbackStudents[rfid] || { studentId: "2024-100999", firstName: "Student", lastName: rfid, program: "BS Information Technology", yearLevel: "1st Year", rfidTagUid: rfid };
            setStudent(studentData);
            setStep("confirm");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kiosk_sessions" },
        (payload) => {
          console.log("[Supabase Realtime] Session updated:", payload.new);
          const { height_m, temp_c, weight_kg, blood_pressure, systolic_mmhg, diastolic_mmhg, bp_classification } = payload.new;
          const patch = {};
          if (temp_c != null) patch.temperatureC = temp_c;
          if (height_m != null) patch.heightCm = height_m * 100;
          if (weight_kg != null) patch.weightKg = weight_kg;
          const pressure = blood_pressure ?? (systolic_mmhg != null && diastolic_mmhg != null ? `${systolic_mmhg}/${diastolic_mmhg}` : null);
          if (pressure != null) patch.bloodPressure = String(pressure);
          // Prefer device-supplied classification; fall back to local computation
          patch.bloodPressureClassification = bp_classification != null
            ? String(bp_classification)
            : (systolic_mmhg != null && diastolic_mmhg != null ? classifyBP(systolic_mmhg, diastolic_mmhg) : null);

          if (Object.keys(patch).length > 0) {
            clearTimeout(captureTimerRef.current);
            setSensorFailed(false);
            setReadings((prev) => ({ ...prev, ...patch }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const stop = startHealthMonitor((online) => {
      setIsOnline(online);
      if (!online) {
        setStep("offline");
      } else {
        setStep((curr) => (curr === "offline" ? "welcome" : curr));
      }
    });
    return stop;
  }, []);

  // Watches `readings` and fires submit once every required field for the current capture mode is available
  useEffect(() => {
    if (step !== "capturing" || submittingRef.current) return;
    const required = REQUIRED_FIELDS[captureMode] || [];
    const isComplete = required.length > 0 && required.every((field) => readings[field] != null);
    if (isComplete) finishCapture(readings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readings, step, captureMode]);

  function resetIdleTimer() {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => resetSession("timeout"), IDLE_TIMEOUT_MS);
  }

  async function resetSession(statusReason = "cancelled") {
    clearTimeout(captureTimerRef.current);
    bpPollAbortRef.current = true;
    setSensorFailed(false);
    setBpNoReading(false);
    setBpWaiting(false);
    const sessionIdToUpdate = currentSessionIdRef.current;
    currentSessionIdRef.current = null;
    submittingRef.current = false;
    setStudent(null);
    setCaptureMode(null);
    setReadings({});
    setManualFields([]);
    setOverrideTriggered(false);
    setResultQueueNumber(null);
    setFlowType(null);
    setConsultSubType(null);
    setOtherServiceSubType(null);
    setCheckInInfo(null);
    setAppointmentSelection(null);
    setClearanceAppointmentPurpose(null);
    setClearanceQueueNumber(null);
    setStep("welcome");
    setWalkInComplaints([]);
    setMedicineSymptoms([]);
    setMedicineSafetyAnswers({});

    if (sessionIdToUpdate) {
      try {
        await supabase
          .from("kiosk_sessions")
          .update({ status: statusReason })
          .eq("id", sessionIdToUpdate)
          .in("status", ["pending_sensor", "tap_logged"]);
      } catch (err) {
        console.warn("[Supabase] Failed to mark session status in resetSession:", err);
      }
    }
  }

  async function handleDeviceEvent(evt) {
    resetIdleTimer();
    console.log("[kiosk-app] received device event:", evt);

    if (evt.type === "rfid_tap") {
      console.log("[kiosk-app] rfid tap detected, looking up student UID:", evt.uid);
      try {
        const found = await lookupStudent(evt.uid);
        console.log("[kiosk-app] student found:", found);
        if (found) {
          setStudent(found);
          setStep("confirm");
        }
      } catch (err) {
        console.error("[kiosk-app] lookup error:", err);
        alert(`Card not recognized (looked up "${evt.uid}"). Please try Manual Entry, or seed a matching student.`);
      }
      return;
    }

    if (stepRef.current !== "capturing" && stepRef.current !== "medicineIntake") return;

    const fieldMap = {
      temperature_reading: { temperatureC: evt.celsius },
      height_reading: { heightCm: evt.cm },
      weight_reading: { weightKg: evt.kg },
      blood_pressure_reading: {
        bloodPressure: evt.bloodPressure ?? evt.reading ?? (evt.systolic != null && evt.diastolic != null ? `${evt.systolic}/${evt.diastolic}` : undefined),
        // Prefer device-supplied classification; fall back to local computation
        bloodPressureClassification: evt.classification ?? classifyBP(evt.systolic, evt.diastolic),
      },
    };
    const patch = fieldMap[evt.type];
    if (!patch || Object.values(patch).every((value) => value == null)) return;

    setReadings((prev) => ({ ...prev, ...patch }));
  }

  deviceEventHandlerRef.current = handleDeviceEvent;

  async function handleManualSubmit(studentId) {
    const found = await lookupStudent(studentId);
    setStudent(found);
    setStep("confirm");
  }

  function handleConfirmYes() {
    setStep("service");
  }

  function handleConfirmNo() {
    resetSession();
  }

  function handleServiceSelect(value) {
  if (value === "Quick Health Screening") {
    setFlowType("screening");
    setStep("screeningOptions");
  } else if (value === "Medical Consultation") {
    handleConsultTypeSelect("Medical");          // skips the old Medical/Dental picker
  } else if (value === "Dental Consultation") {
    handleConsultTypeSelect("Dental");
  } else if (value === "Prescription/OTC Pickup") {
    setOtherServiceSubType("Prescription/OTC");
    setFlowType("medicine");
    setReadings({});
    setMedicineSymptoms([]);
    setMedicineSafetyAnswers({});
    setStep("medicineIntake");
    triggerHardwareSensors("temperature", "Prescription/OTC Pickup");
  } else if (value === "General Inquiry") {
    setOtherServiceSubType("General Inquiry");
    setStep("requestText");
  } else if (value === "Medical Clearance") {
    setFlowType("clearance");
    setClearanceQueueNumber(null);
    setStep("clearanceEntry");
  } else {
    submitIntake({ studentId: student.studentId, serviceType: value, source: "kiosk" }).finally(resetSession);
  }
}

function toggleMedicineSymptom(symptom) {
  setMedicineSymptoms((current) => current.includes(symptom)
    ? current.filter((item) => item !== symptom)
    : [...current, symptom]);
}

async function handleMedicineSubmit() {
  if (submittingRef.current || readings.temperatureC == null || medicineSymptoms.length === 0 || Object.keys(medicineSafetyAnswers).length < 3) return;
  submittingRef.current = true;
  const temperatureC = Number(readings.temperatureC);
  const temperatureClass = classifyTemp(temperatureC);
  const reasonText = medicineSymptoms.join(", ");
  try {
    const result = await submitIntake({
      studentId: student?.studentId || student?.rfidTagUid,
      serviceType: "Prescription/OTC Pickup",
      source: "kiosk",
      reason: reasonText.length > 60 ? `${reasonText.slice(0, 57)}...` : reasonText,
      temperatureC,
      requestDetails: JSON.stringify({ symptoms: medicineSymptoms, safetyAnswers: medicineSafetyAnswers }),
    });
    currentSessionIdRef.current = null;
    setResultQueueNumber(result?.queueEntry?.queueNumber ?? null);
    setOverrideTriggered(temperatureClass !== "Normal");
    setStep("medicineResult");
  } catch (error) {
    console.warn("[handleMedicineSubmit] intake submission failed:", error);
    submittingRef.current = false;
    alert("We couldn't complete your request. Please try again or see the clinic staff.");
  }
}

  function handleConsultTypeSelect(subType) {
  setFlowType("consultation");
  setConsultSubType(subType);
  setStep("consultationEntry");
}

function handleBookAppointment() {
  setAppointmentSelection(null);
  setStep("appointmentBooking");
}

async function handleAppointmentProceed(selection) {
  const serviceType = clearanceAppointmentPurpose
    ? "Medical Clearance"
    : consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation";
  const { appointment } = await createAppointment({
    studentId: student?.studentId || student?.rfidTagUid,
    serviceType,
    purpose: clearanceAppointmentPurpose || undefined,
    date: selection.dateKey,
    timeSlot: selection.time,
  });
  setAppointmentSelection({ ...selection, appointmentId: appointment._id });
  setStep("appointmentConfirmed");
}

async function handleClearanceSubmit({ purpose, documents }) {
  const result = await submitIntake({
    studentId: student?.studentId || student?.rfidTagUid,
    serviceType: "Medical Clearance",
    source: "kiosk",
    reason: purpose,
    requestDetails: JSON.stringify({ purpose, documents }),
  });
  setClearanceQueueNumber(result?.queueEntry?.queueNumber ?? null);
  setStep("clearanceResult");
}

async function handleWalkIn() {
  submittingRef.current = false;
  setReadings({});
  setManualFields([]);
  setWalkInComplaints([]);
  setCaptureMode("temperature");
  setStep("walkInIntake");
  await triggerHardwareSensors("temperature");
}

function handleToggleComplaint(key) {
  setWalkInComplaints((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
  );
}

async function handleLeaveWalkIn() {
  clearTimeout(captureTimerRef.current);
  setSensorFailed(false);
  const sessionId = currentSessionIdRef.current;
  currentSessionIdRef.current = null;
  submittingRef.current = false;
  setReadings({});
  setWalkInComplaints([]);
  setMedicineSymptoms([]);
  setMedicineSafetyAnswers({});
  setCaptureMode(null);
  setFlowType(null);
  setConsultSubType(null);
  setStep("service");

  if (sessionId) {
    try {
      await supabase
        .from("kiosk_sessions")
        .update({ status: "cancelled" })
        .eq("id", sessionId)
        .in("status", ["pending_sensor", "tap_logged"]);
    } catch (err) {
      console.warn("[Supabase] Failed to cancel session in handleLeaveWalkIn:", err);
    }
  }
}

async function handleWalkInSubmit() {
  if (submittingRef.current) return;
  const temperatureC = readings.temperatureC != null ? Number(readings.temperatureC) : null;
  if (temperatureC == null || walkInComplaints.length === 0) return;

  submittingRef.current = true;
  clearTimeout(captureTimerRef.current);

  const serviceType = consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation";
  const complaintText = walkInComplaints
    .map((k) => COMPLAINTS.find((c) => c.key === k)?.label ?? k)
    .join(", ");
  const reason = complaintText.length > 60 ? `${complaintText.slice(0, 57)}...` : complaintText;

  try {
    const result = await submitIntake({
      studentId: student?.studentId || student?.rfidTagUid,
      serviceType,
      source: "kiosk",
      temperatureC,
      reason,
      requestDetails: `Walk-in ${consultSubType} consultation. Chief complaint: ${complaintText}`,
    });
    currentSessionIdRef.current = null;
    setOverrideTriggered(classifyTemp(temperatureC) !== "Normal");
    setResultQueueNumber(result?.queueEntry?.queueNumber ?? null);
    setStep("walkInResult");
  } catch (err) {
    console.warn("[handleWalkInSubmit] intake submission failed:", err);
    submittingRef.current = false;
    alert("We couldn't check you in. Please try again or see the clinic staff.");
  }
}

  function handleOtherServiceTypeSelect(subType) {
    setOtherServiceSubType(subType);
    setStep("requestText");
  }

  async function handleRequestTextSubmit(text) {
    const serviceType = otherServiceSubType === "Prescription/OTC" ? "Prescription/OTC Pickup" : "General Inquiry";
    const reason = text.length > 60 ? `${text.slice(0, 57)}...` : text;
    const result = await submitIntake({
      studentId: student.studentId,
      serviceType,
      reason,
      requestDetails: text,
      source: "kiosk",
    });
    setCheckInInfo({ serviceType, queueNumber: result?.queueEntry?.queueNumber });
    setStep("checkedIn");
  }

  /**
   * Polls Supabase every 2s for up to 15s waiting for a 'bp_logged' row.
   * When found, marks it 'bp_consumed' and injects readings into state.
   * Can be cancelled mid-poll by setting bpPollAbortRef.current = true.
   * Returns true if a reading was found and injected, false if timed out or cancelled.
   */
  async function fetchLatestBpReading() {
    const POLL_INTERVAL_MS = 2000;
    const MAX_WAIT_MS = 15000;
    const startTime = Date.now();
    bpPollAbortRef.current = false;

    while (Date.now() - startTime < MAX_WAIT_MS) {
      if (bpPollAbortRef.current) {
        console.log("[fetchLatestBpReading] Poll cancelled by navigation.");
        return false;
      }

      try {
        const { data, error } = await supabase
          .from("kiosk_sessions")
          .select("id, systolic_mmhg, diastolic_mmhg, pulse_bpm")
          .eq("status", "bp_logged")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!error && data) {
          const { id, systolic_mmhg, diastolic_mmhg, pulse_bpm } = data;

          // Mark it consumed so it won't be picked up again
          await supabase
            .from("kiosk_sessions")
            .update({ status: "bp_consumed" })
            .eq("id", id);

          const bp = `${systolic_mmhg}/${diastolic_mmhg}`;
          const bpClassification = classifyBP(systolic_mmhg, diastolic_mmhg);
          setReadings((prev) => ({
            ...prev,
            bloodPressure: bp,
            systolicMmhg: systolic_mmhg,
            diastolicMmhg: diastolic_mmhg,
            pulseBpm: pulse_bpm,
            bloodPressureClassification: bpClassification,
          }));

          console.log(`[fetchLatestBpReading] Injected BP: ${bp}, Pulse: ${pulse_bpm} bpm (session id: ${id}) after ${Math.round((Date.now() - startTime) / 1000)}s`);
          setBpWaiting(false);
          return true;
        }
      } catch (err) {
        console.warn("[fetchLatestBpReading] Poll error:", err);
      }

      // Wait 2s before next poll attempt
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    console.warn("[fetchLatestBpReading] Timed out after 15s — no bp_logged row found.");
    setBpWaiting(false);
    return false;
  }

  async function handleScreeningOptionSelect(mode) {
    submittingRef.current = false;
    setReadings({});
    setManualFields([]);
    setBpNoReading(false);
    setBpWaiting(false);
    setCaptureMode(mode);
    setFlowType("screening");
    setStep("capturing");

    const needsBp = mode === "bloodPressure" || mode === "complete";

    if (mode === "complete") {
      // Start hardware sensors immediately (temp + height + weight)
      triggerHardwareSensors("complete", "Quick Health Screening");
      // Poll for BP in parallel — it patches readings when found
      setBpWaiting(true);
      fetchLatestBpReading().then((found) => {
        if (!found && !bpPollAbortRef.current) {
          setBpNoReading(true);
          // Don't set sensorFailed — hardware sensors are still running for other fields
        }
      });
      return;
    }

    if (mode === "bloodPressure") {
      // Only waiting for BP — poll for up to 15s
      setBpWaiting(true);
      const found = await fetchLatestBpReading();
      if (!found && !bpPollAbortRef.current) {
        setBpNoReading(true);
        setSensorFailed(true);
      }
      return;
    }

    // temperature or bmi — no BP involved
    const sensorMode = mode === "bmi" ? "physical" : mode;
    triggerHardwareSensors(sensorMode, "Quick Health Screening");
  }

  async function handleCancelScreening() {
    clearTimeout(captureTimerRef.current);
    bpPollAbortRef.current = true;
    setSensorFailed(false);
    setBpNoReading(false);
    setBpWaiting(false);
    const sessionId = currentSessionIdRef.current;
    currentSessionIdRef.current = null;
    submittingRef.current = false;
    setReadings({});
    setCaptureMode(null);
    setFlowType(null);
    setStep("screeningOptions");
    if (sessionId) {
      try {
        await supabase.from("kiosk_sessions").update({ status: "cancelled" }).eq("id", sessionId).in("status", ["pending_sensor", "tap_logged"]);
      } catch (error) {
        console.warn("[handleCancelScreening] Failed to cancel sensor session:", error);
      }
    }
  }

  async function triggerHardwareSensors(sensorCmd, selectedService = null) {
    clearTimeout(captureTimerRef.current);
    setSensorFailed(false);
    let sessionId = null;

    try {
      const { data } = await supabase.from("kiosk_sessions").insert([
        {
          rfid_uid: student?.rfidTagUid || student?.studentId,
          service_selected: selectedService || (flowType === "consultation"
            ? `${consultSubType === "Dental" ? "Dental" : "Medical"} Consultation`
            : "Quick Health Screening"),
          sensor_required: sensorCmd,
          status: "pending_sensor"
        }
      ]).select();

      if (data && data[0]?.id) {
        sessionId = data[0].id;
        currentSessionIdRef.current = sessionId;
      }
    } catch (err) {
      console.warn("[triggerHardwareSensors] Supabase session insertion error:", err);
    }

    // Production Hardware Timeout: If physical sensors do not report data within 6s, show failed window
    captureTimerRef.current = setTimeout(() => {
      console.warn("[triggerHardwareSensors] No sensor data received from hardware within timeout.");
      setSensorFailed(true);
    }, 6000);
  }

  async function handleVitalsProceed(enteredReadings) {
    const mode = captureMode || "complete";
    const required = REQUIRED_FIELDS[mode] || [];
    const enteredKeys = Object.keys(enteredReadings);

    // Merge manual values with state
    setReadings(enteredReadings);
    setManualFields(enteredKeys);

    const missing = required.filter((field) => enteredReadings[field] == null);

    // Case 1: All required values were entered manually!
    if (missing.length === 0) {
      finishCapture(enteredReadings);
      return;
    }

    // Case 2: Partial or empty (Hybrid / Auto-scan required for missing fields)
    let sensorCmd = "complete";
    const needsTemp = missing.includes("temperatureC");
    const needsPhysical = missing.includes("heightCm") || missing.includes("weightKg");

    if (needsTemp && !needsPhysical) {
      sensorCmd = "temperature";
    } else if (!needsTemp && needsPhysical) {
      sensorCmd = "physical";
    } else {
      sensorCmd = "complete";
    }

    setStep("capturing");
    await triggerHardwareSensors(sensorCmd);
  }

  async function handleFullAutoScan() {
    const mode = captureMode || "complete";
    setReadings({});
    setManualFields([]);
    const sensorCmd = mode === "complete" ? "complete" : mode === "temperature" ? "temperature" : "physical";
    setStep("capturing");
    await triggerHardwareSensors(sensorCmd);
  }

  async function finishCapture(finalReadings) {
    submittingRef.current = true;
    currentSessionIdRef.current = null;
    const targetStudentId = student?.studentId || student?.rfidTagUid || "2024-100123";

    try {
      if (flowType === "consultation") {
        const serviceType = consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation";
        const result = await submitIntake({
          studentId: targetStudentId,
          serviceType,
          source: "kiosk",
          temperatureC: finalReadings.temperatureC,
        });
        setCheckInInfo({
          serviceType,
          queueNumber: result?.queueEntry?.queueNumber,
          temperatureC: finalReadings.temperatureC,
        });
        setStep("checkedIn");
        return;
      }

      const result = await submitIntake({
        studentId: targetStudentId,
        serviceType: "Quick Health Screening",
        source: "kiosk",
        temperatureC: finalReadings.temperatureC,
        bloodPressure: finalReadings.bloodPressure,
        bloodPressureClassification: finalReadings.bloodPressureClassification,
        heightCm: finalReadings.heightCm,
        weightKg: finalReadings.weightKg,
      });
      setOverrideTriggered(!!result.overrideTriggered);
      setResultQueueNumber(result.queueEntry?.queueNumber ?? null);
      setStep("result");
    } catch (err) {
      console.warn("[finishCapture] API intake submission fallback:", err);
      setStep("result");
    }
  }

  const walkInTemp = readings.temperatureC != null ? Number(readings.temperatureC) : null;

  return (
    <div onClick={isOnline ? resetIdleTimer : undefined}>
      {step === "offline" && <OfflineScreen onRetry={() => resetSession()} />}

      {step === "welcome" && <WelcomeScreen onManualEntry={() => setStep("manual")} />}

      {step === "manual" && (
        <ManualEntryScreen onSubmit={handleManualSubmit} onCancel={resetSession} isOnline={isOnline} />
      )}

      {step === "confirm" && (
        <IdentityVerificationScreen student={student} onProceed={handleConfirmYes} onBack={handleConfirmNo} isOnline={isOnline} />
      )}

      {step === "service" && (
        <ServiceSelectScreen onSelect={handleServiceSelect} onBack={() => setStep("confirm")} isOnline={isOnline} />
      )}

      {step === "consultationType" && (
        <ConsultationTypeScreen onSelect={handleConsultTypeSelect} onBack={() => setStep("service")} isOnline={isOnline} />
      )}

      {step === "consultationEntry" && (
  <ConsultationEntryScreen
    consultSubType={consultSubType}
    onWalkIn={handleWalkIn}
    onBookAppointment={handleBookAppointment}
    onBack={() => {
      setFlowType(null);
      setConsultSubType(null);
      setStep("service");
    }}
    isOnline={isOnline}
  />
)}

{step === "clearanceEntry" && (
  <ClearanceEntryScreen
    onWalkIn={() => setStep("clearanceIntake")}
    onBookAppointment={() => {
      setClearanceAppointmentPurpose(null);
      setStep("clearanceAppointmentPurpose");
    }}
    onBack={() => {
      setFlowType(null);
      setStep("service");
    }}
    isOnline={isOnline}
  />
)}

{step === "clearanceAppointmentPurpose" && (
  <ClearanceIntakeScreen
    isAppointment
    onSubmit={({ purpose }) => {
      setClearanceAppointmentPurpose(purpose);
      setStep("clearanceAppointmentBooking");
    }}
    onBack={() => setStep("clearanceEntry")}
    isOnline={isOnline}
  />
)}

{step === "clearanceIntake" && (
  <ClearanceIntakeScreen
    onSubmit={handleClearanceSubmit}
    onBack={() => setStep("clearanceEntry")}
    isOnline={isOnline}
  />
)}

      {step === "clearanceResult" && (
  <ClearanceResultScreen
    queueNumber={clearanceQueueNumber}
    onDone={resetSession}
    isOnline={isOnline}
  />
)}

{step === "appointmentBooking" && (
  <AppointmentBookingScreen
    consultSubType={consultSubType}
    serviceType={consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation"}
    onProceed={handleAppointmentProceed}
    onBack={() => setStep("consultationEntry")}
    isOnline={isOnline}
  />
)}

{step === "clearanceAppointmentBooking" && (
  <AppointmentBookingScreen
    serviceLabel="MEDICAL CLEARANCE"
    serviceType="Medical Clearance"
    purpose={clearanceAppointmentPurpose}
    onProceed={handleAppointmentProceed}
    onBack={() => setStep("clearanceAppointmentPurpose")}
    isOnline={isOnline}
  />
)}

{step === "appointmentConfirmed" && appointmentSelection && !clearanceAppointmentPurpose && (
  <AppointmentConfirmedScreen
    consultSubType={consultSubType}
    dateLabel={appointmentSelection.date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })}
    timeLabel={appointmentSelection.time}
    onDone={resetSession}
    isOnline={isOnline}
  />
)}

{step === "appointmentConfirmed" && appointmentSelection && clearanceAppointmentPurpose && (
  <AppointmentConfirmedScreen
    serviceLabel="MEDICAL CLEARANCE"
    purposeLabel={clearanceAppointmentPurpose}
    dateLabel={appointmentSelection.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
    timeLabel={appointmentSelection.time}
    onDone={resetSession}
    isOnline={isOnline}
  />
)}

{step === "walkInIntake" && (
  <WalkInIntakeScreen
    consultSubType={consultSubType}
    selectedComplaints={walkInComplaints}
    onToggleComplaint={handleToggleComplaint}
    temperatureC={walkInTemp}
    onContinue={handleWalkInSubmit}
    onBack={handleLeaveWalkIn}
    isOnline={isOnline}
  />
)}

{step === "walkInResult" && (
  <WalkInResultScreen
    consultSubType={consultSubType}
    overrideTriggered={overrideTriggered}
    queueCode={resultQueueNumber}
    temperatureC={walkInTemp}
    temperatureClassification={classifyTemp(walkInTemp)}
    onTimeout={resetSession}
    isOnline={isOnline}
  />
)}

      {step === "otherServicesType" && (
        <OtherServicesTypeScreen onSelect={handleOtherServiceTypeSelect} onBack={() => setStep("service")} isOnline={isOnline} />
      )}

      {step === "medicineIntake" && (
        <PrescriptionIntakeScreen
          selectedSymptoms={medicineSymptoms}
          safetyAnswers={medicineSafetyAnswers}
          temperatureC={readings.temperatureC}
          onToggleSymptom={toggleMedicineSymptom}
          onAnswerSafety={(question, answer) => setMedicineSafetyAnswers((current) => ({ ...current, [question]: answer }))}
          onContinue={handleMedicineSubmit}
          onBack={handleLeaveWalkIn}
          isOnline={isOnline}
        />
      )}

      {step === "medicineResult" && (
        <WalkInResultScreen
          serviceLabel="PRESCRIPTION & MEDICINE"
          overrideTriggered={overrideTriggered}
          queueCode={resultQueueNumber}
          temperatureC={walkInTemp}
          temperatureClassification={classifyTemp(walkInTemp)}
          onTimeout={resetSession}
          isOnline={isOnline}
        />
      )}

      {step === "requestText" && (
        <RequestTextScreen onSubmit={handleRequestTextSubmit} onBack={() => setStep("service")} isOnline={isOnline} />
      )}

      {step === "checkedIn" && (
        <CheckedInScreen info={checkInInfo} onDone={resetSession} isOnline={isOnline} />
      )}

      {step === "screeningOptions" && (
        <ScreeningOptionsScreen onSelect={handleScreeningOptionSelect} onBack={() => setStep("service")} isOnline={isOnline} />
      )}

      {step === "vitalsEntry" && (
        <VitalsEntryScreen
          mode={captureMode}
          initialReadings={readings}
          onProceed={handleVitalsProceed}
          onAutoScan={handleFullAutoScan}
          onBack={() => setStep(flowType === "consultation" ? "consultationType" : "screeningOptions")}
          isOnline={isOnline}
        />
      )}

      {step === "capturing" && (
        flowType === "screening" ? (
          <ScreeningReadingsScreen
            mode={captureMode}
            readings={readings}
            pulseBpm={readings.pulseBpm}
            sensorFailed={sensorFailed}
            bpNoReading={bpNoReading}
            bpWaiting={bpWaiting}
            onBack={handleCancelScreening}
            isOnline={isOnline}
          />
        ) : (
          <CapturingScreen
            mode={captureMode}
            readings={readings}
            manualFields={manualFields}
            sensorFailed={sensorFailed}
            onManualEdit={() => {
              clearTimeout(captureTimerRef.current);
              setSensorFailed(false);
              setStep("vitalsEntry");
            }}
            onHome={resetSession}
            onCancel={resetSession}
            isOnline={isOnline}
          />
        )
      )}

      {step === "result" && (
        flowType === "screening" ? (
          <ScreeningReadingsScreen
            mode={captureMode}
            readings={readings}
            pulseBpm={readings.pulseBpm}
            isResult
            onDone={resetSession}
            isOnline={isOnline}
          />
        ) : (
          <ResultScreen
            readings={readings}
            overrideTriggered={overrideTriggered}
            queueNumber={resultQueueNumber}
            onAdjust={() => {
              submittingRef.current = false;
              setStep("vitalsEntry");
            }}
            onDone={resetSession}
            isOnline={isOnline}
          />
        )
      )}

    </div>
  );
}
