import { useEffect, useRef, useState } from "react";
import WelcomeScreen from "./screens/WelcomeScreen.jsx";
import ManualEntryScreen from "./screens/ManualEntryScreen.jsx";
import IdentityVerificationScreen from "./screens/IdentityVerificationScreen.jsx";
import ServiceSelectScreen from "./screens/ServiceSelectScreen.jsx";
import QrChoiceScreen from "./screens/QrChoiceScreen.jsx";
import MobileVitalsEntryScreen from "./screens/MobileVitalsEntryScreen.jsx";
import MobileSensorReadingsScreen from "./screens/MobileSensorReadingsScreen.jsx";
import "./styles/mobile-flow.css";
import ConsultationTypeScreen from "./screens/ConsultationTypeScreen.jsx";
import OtherServicesTypeScreen from "./screens/OtherServicesTypeScreen.jsx";
import RequestTextScreen from "./screens/RequestTextScreen.jsx";
import CheckedInScreen from "./screens/CheckedInScreen.jsx";
import ScreeningOptionsScreen from "./screens/ScreeningOptionsScreen.jsx";
import KioskFaqScreen from "./screens/KioskFaqScreen.jsx";
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
import { classifyBP } from "./utils/bp.js";

// Leave time for non-BP sensors and BLE connection before the cuff's 120s wait ends.
const BP_READING_TIMEOUT_MS = 180_000;
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
  const mobileSessionToken = new URLSearchParams(window.location.search).get("mobileServiceSession");
  const [mobileSessionStatus, setMobileSessionStatus] = useState(mobileSessionToken ? "loading" : "idle");
  const [mobileSessionError, setMobileSessionError] = useState("");
  const [mobileFlowComplete, setMobileFlowComplete] = useState(false);
  const mobileMode = Boolean(mobileSessionToken && mobileSessionStatus === "ready");
  const [step, setStep] = useState("welcome");
  const [faqReturnStep, setFaqReturnStep] = useState("service");
  const openFaq = () => { setFaqReturnStep(step); setStep("faq"); };
  useEffect(() => {
    const handler = () => openFaq();
    window.addEventListener("kiosk:faq", handler);
    return () => window.removeEventListener("kiosk:faq", handler);
  }, [step]);
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
  const [walkInOtherText, setWalkInOtherText] = useState("");
  const [medicineOtherText, setMedicineOtherText] = useState("");
  const [serviceSessionId, setServiceSessionId] = useState(null);
  const [serviceSessionReady, setServiceSessionReady] = useState(false);

  const bridgeRef = useRef(null);
  const deviceEventHandlerRef = useRef(null);
  const idleTimer = useRef(null);
  const captureTimerRef = useRef(null);
  const stepRef = useRef(step);
  const submittingRef = useRef(false); // guards against double-submit
  const currentSessionIdRef = useRef(null);
  const mobileSensorSessionIdRef = useRef(null);
  const bpTimeoutRef = useRef(null);

  useEffect(() => {
    if (!mobileSessionToken) return undefined;
    if (!supabase) {
      setMobileSessionError("Mobile check-in is unavailable. Please return to the kiosk or ask clinic staff for help.");
      setMobileSessionStatus("error");
      return undefined;
    }

    let active = true;
    async function loadMobileSession() {
      try {
        const { data, error } = await supabase.from("kiosk_sessions")
          .select("id, rfid_uid, status, sensor_required, temp_c, height_m, weight_kg, blood_pressure, systolic_mmhg, diastolic_mmhg, pulse_bpm, bp_classification")
          .eq("id", mobileSessionToken)
          .in("status", ["awaiting_service_selection", "mobile_flow_started", "mobile_sensor_requested", "mobile_readings_ready"])
          .maybeSingle();
        if (error) throw error;
        if (!data?.rfid_uid) throw new Error("This mobile check-in link has expired. Please scan the kiosk QR code again.");

        const found = await lookupStudent(data.rfid_uid);
        if (!found) throw new Error("We couldn't verify the student for this session. Please ask clinic staff for help.");

        if (data.status === "awaiting_service_selection") {
          const { data: updated, error: updateError } = await supabase.from("kiosk_sessions")
            .update({ status: "mobile_flow_started" })
            .eq("id", data.id)
            .eq("status", "awaiting_service_selection")
            .select("id")
            .maybeSingle();
          if (updateError) throw updateError;
          if (!updated) throw new Error("This mobile check-in link is already in use. Please scan the kiosk QR again.");
        }

        if (!active) return;
        currentSessionIdRef.current = data.id;
        setStudent(found);
        if (data.status === "mobile_sensor_requested" || data.status === "mobile_readings_ready") {
          const nextReadings = {};
          if (data.temp_c != null) nextReadings.temperatureC = Number(data.temp_c);
          if (data.height_m != null) nextReadings.heightCm = Number(data.height_m) * 100;
          if (data.weight_kg != null) nextReadings.weightKg = Number(data.weight_kg);
          if (data.systolic_mmhg != null) nextReadings.systolicMmhg = Number(data.systolic_mmhg);
          if (data.diastolic_mmhg != null) nextReadings.diastolicMmhg = Number(data.diastolic_mmhg);
          if (data.blood_pressure != null) nextReadings.bloodPressure = String(data.blood_pressure);
          if (data.pulse_bpm != null) nextReadings.pulseBpm = Number(data.pulse_bpm);
          if (data.bp_classification != null) nextReadings.bloodPressureClassification = String(data.bp_classification);
          setReadings(nextReadings);
          setCaptureMode(data.sensor_required || "complete");
          setFlowType("screening");
          setStep(data.status === "mobile_readings_ready" ? "mobileSensorReview" : "mobileSensorWaiting");
        } else setStep("service");
        setMobileSessionStatus("ready");
      } catch (error) {
        if (!active) return;
        setMobileSessionError(error?.message || "We couldn't start mobile check-in. Please return to the kiosk.");
        setMobileSessionStatus("error");
      }
    }
    loadMobileSession();
    return () => { active = false; };
  }, [mobileSessionToken]);

  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    if (step === "capturing") {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, [step]);

  useEffect(() => {
    bridgeRef.current = connectDeviceBridge((event) => deviceEventHandlerRef.current?.(event));
    return () => {
      bridgeRef.current?.close();
      bridgeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      console.error("[Supabase] Missing VITE_SUPABASE_ANON_KEY; ESP32 Realtime intake is unavailable.");
      return undefined;
    }
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
              setServiceSessionId(payload.new.id);
            }
            const rfid = payload.new.rfid_uid;
            try {
              const found = await lookupStudent(rfid);
              if (found) {
                setStudent(found);
                setStep("confirm");
                return;
              }
            } catch (error) {
              console.warn("[Supabase] RFID student lookup failed:", error);
            }
            window.alert(`Card ${rfid} could not be verified. Please use manual entry or contact clinic staff.`);
            await resetSession("cancelled");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kiosk_sessions" },
        (payload) => {
          console.log("[Supabase Realtime] Session updated:", payload.new);
          const isMobileSensorParent = mobileSensorSessionIdRef.current && String(payload.new?.id) === String(mobileSensorSessionIdRef.current);
          if ((!currentSessionIdRef.current || String(payload.new?.id) !== String(currentSessionIdRef.current)) && !isMobileSensorParent) return;
          if (payload.new?.status === "mobile_flow_started" && stepRef.current === "serviceAccess") {
            setStep("mobileWaiting");
            return;
          }
          if (payload.new?.status === "awaiting_service_selection" && stepRef.current === "mobileWaiting") {
            setStep("serviceAccess");
            return;
          }
          if (payload.new?.status === "completed" && stepRef.current === "mobileWaiting") {
            void resetSession("completed");
            return;
          }
          if (payload.new?.status === "mobile_sensor_requested" && !mobileSessionToken && !mobileSensorSessionIdRef.current && stepRef.current === "mobileWaiting") {
            const mode = payload.new?.sensor_required || "complete";
            mobileSensorSessionIdRef.current = payload.new.id;
            setFlowType("mobileSensorCapture");
            setCaptureMode(mode);
            setReadings({});
            setManualFields([]);
            setBpNoReading(false);
            setSensorFailed(false);
            if (mode === "complete" || mode === "bloodPressure") {
              setBpWaiting(true);
              clearTimeout(bpTimeoutRef.current);
              bpTimeoutRef.current = setTimeout(() => { setBpWaiting(false); setBpNoReading(true); }, BP_READING_TIMEOUT_MS);
            }
            setStep("capturing");
            void triggerHardwareSensors(mode === "bmi" ? "physical" : mode, "Quick Health Screening");
            return;
          }
          if (payload.new?.status === "mobile_readings_ready" && !mobileSessionToken && mobileSensorSessionIdRef.current) {
            clearTimeout(captureTimerRef.current);
            clearTimeout(bpTimeoutRef.current);
            bpTimeoutRef.current = null;
            currentSessionIdRef.current = mobileSensorSessionIdRef.current;
            mobileSensorSessionIdRef.current = null;
            setBpWaiting(false);
            setFlowType(null);
            setStep("mobileWaiting");
            return;
          }
          if (payload.new?.status === "awaiting_service_selection" && !mobileSessionToken && mobileSensorSessionIdRef.current) {
            clearTimeout(captureTimerRef.current);
            clearTimeout(bpTimeoutRef.current);
            bpTimeoutRef.current = null;
            const sensorSessionId = currentSessionIdRef.current;
            if (sensorSessionId) void supabase.from("kiosk_sessions").update({ status: "cancelled" }).eq("id", sensorSessionId).eq("status", "pending_sensor");
            currentSessionIdRef.current = payload.new.id;
            mobileSensorSessionIdRef.current = null;
            setFlowType(null);
            setCaptureMode(null);
            setBpWaiting(false);
            setStep("serviceAccess");
            return;
          }
          if (payload.new?.status === "mobile_flow_started" && !mobileSessionToken && mobileSensorSessionIdRef.current && stepRef.current === "capturing") {
            clearTimeout(captureTimerRef.current);
            clearTimeout(bpTimeoutRef.current);
            bpTimeoutRef.current = null;
            const sensorSessionId = currentSessionIdRef.current;
            if (sensorSessionId) void supabase.from("kiosk_sessions").update({ status: "cancelled" }).eq("id", sensorSessionId).eq("status", "pending_sensor");
            currentSessionIdRef.current = payload.new.id;
            mobileSensorSessionIdRef.current = null;
            setFlowType(null);
            setCaptureMode(null);
            setBpWaiting(false);
            setStep("mobileWaiting");
            return;
          }
          if ((payload.new?.status === "mobile_readings_ready" || payload.new?.status === "mobile_sensor_requested") && mobileSessionToken && String(payload.new?.id) === String(mobileSessionToken)) {
            const row = payload.new;
            const nextReadings = {};
            if (row.temp_c != null) nextReadings.temperatureC = Number(row.temp_c);
            if (row.height_m != null) nextReadings.heightCm = Number(row.height_m) * 100;
            if (row.weight_kg != null) nextReadings.weightKg = Number(row.weight_kg);
            if (row.systolic_mmhg != null) nextReadings.systolicMmhg = Number(row.systolic_mmhg);
            if (row.diastolic_mmhg != null) nextReadings.diastolicMmhg = Number(row.diastolic_mmhg);
            if (row.blood_pressure != null) nextReadings.bloodPressure = String(row.blood_pressure);
            else if (row.systolic_mmhg != null && row.diastolic_mmhg != null) nextReadings.bloodPressure = `${row.systolic_mmhg}/${row.diastolic_mmhg}`;
            if (row.pulse_bpm != null) nextReadings.pulseBpm = Number(row.pulse_bpm);
            if (row.bp_classification != null) nextReadings.bloodPressureClassification = String(row.bp_classification);
            else if (nextReadings.systolicMmhg != null && nextReadings.diastolicMmhg != null) nextReadings.bloodPressureClassification = classifyBP(nextReadings.systolicMmhg, nextReadings.diastolicMmhg);
            setReadings(nextReadings);
            setManualFields([]);
            if (row.status === "mobile_readings_ready") setStep("mobileSensorReview");
            return;
          }
          if (stepRef.current !== "capturing") return;
          const { height_m, temp_c, weight_kg, blood_pressure, systolic_mmhg, diastolic_mmhg, pulse_bpm, bp_classification } = payload.new;
          const patch = {};
          if (temp_c != null) patch.temperatureC = temp_c;
          if (height_m != null) patch.heightCm = height_m * 100;
          if (weight_kg != null) patch.weightKg = weight_kg;
          const pressure = blood_pressure ?? (systolic_mmhg != null && diastolic_mmhg != null ? `${systolic_mmhg}/${diastolic_mmhg}` : null);
          if (pressure != null) patch.bloodPressure = String(pressure);
          if (systolic_mmhg != null) patch.systolicMmhg = systolic_mmhg;
          if (diastolic_mmhg != null) patch.diastolicMmhg = diastolic_mmhg;
          if (pulse_bpm != null) patch.pulseBpm = pulse_bpm;
          if (bp_classification != null || (systolic_mmhg != null && diastolic_mmhg != null)) {
            // Prefer device-supplied classification; fall back to local computation.
            patch.bloodPressureClassification = bp_classification != null
              ? String(bp_classification)
              : classifyBP(systolic_mmhg, diastolic_mmhg);
          }

          if (pressure != null) {
            clearTimeout(bpTimeoutRef.current);
            bpTimeoutRef.current = null;
            setBpWaiting(false);
            setBpNoReading(false);
          }

          if (Object.keys(patch).length > 0) {
            clearTimeout(captureTimerRef.current);
            setSensorFailed(false);
            setReadings((prev) => ({ ...prev, ...patch }));
            if (!mobileSessionToken && mobileSensorSessionIdRef.current && String(payload.new?.id) === String(currentSessionIdRef.current)) void publishMobileReadingPatch(patch);
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
      if (!online && !mobileSessionToken) {
        setStep("offline");
      } else if (online) {
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
    const hasBpReading = readings.bloodPressure != null ||
      (readings.systolicMmhg != null && readings.diastolicMmhg != null);
    const bpCaptureFailed = (flowType === "screening" || flowType === "mobileSensorCapture") && captureMode === "bloodPressure" && bpNoReading;
    if (bpCaptureFailed) {
      finishCapture(readings);
      return;
    }
    const bpRequiredForScreening = (flowType === "screening" || flowType === "mobileSensorCapture") &&
      (captureMode === "complete" || captureMode === "bloodPressure");
    if (isComplete && (bpWaiting || (bpRequiredForScreening && !hasBpReading && !bpNoReading))) return;
    if (isComplete) finishCapture(readings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readings, step, captureMode, bpWaiting, flowType]);

  function resetIdleTimer() {
    clearTimeout(idleTimer.current);
    idleTimer.current = null;
  }

  async function resetSession(statusReason = "cancelled") {
    clearTimeout(idleTimer.current);
    idleTimer.current = null;
    clearTimeout(captureTimerRef.current);
    clearTimeout(bpTimeoutRef.current);
    bpTimeoutRef.current = null;
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
    setServiceSessionId(null);
    setServiceSessionReady(false);
    setWalkInOtherText("");
    setMedicineOtherText("");

    if (sessionIdToUpdate && supabase) {
      try {
        await supabase
          .from("kiosk_sessions")
          .update({ status: statusReason })
          .eq("id", sessionIdToUpdate)
          .in("status", ["pending_sensor", "tap_logged", "awaiting_service_selection", "mobile_flow_started"]);
      } catch (err) {
        console.warn("[Supabase] Failed to mark session status in resetSession:", err);
      }
    }

  }

  async function publishMobileReadingPatch(patch) {
    const sessionId = mobileSensorSessionIdRef.current;
    if (!sessionId || !supabase) return;
    const update = {};
    if (patch.temperatureC != null) update.temp_c = patch.temperatureC;
    if (patch.heightCm != null) update.height_m = Number(patch.heightCm) / 100;
    if (patch.weightKg != null) update.weight_kg = patch.weightKg;
    if (patch.bloodPressure != null) update.blood_pressure = patch.bloodPressure;
    if (patch.systolicMmhg != null) update.systolic_mmhg = patch.systolicMmhg;
    if (patch.diastolicMmhg != null) update.diastolic_mmhg = patch.diastolicMmhg;
    if (patch.pulseBpm != null) update.pulse_bpm = patch.pulseBpm;
    if (patch.bloodPressureClassification != null) update.bp_classification = patch.bloodPressureClassification;
    if (Object.keys(update).length) {
      const { error } = await supabase.from("kiosk_sessions").update(update)
        .eq("id", sessionId).eq("status", "mobile_sensor_requested");
      if (error) console.warn("[publishMobileReadingPatch] Could not send a live reading to the phone:", error);
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
        alert(`Card ${evt.uid} could not be verified. Please use manual entry or contact clinic staff.`);
        await resetSession("cancelled");
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
        systolicMmhg: evt.systolic,
        diastolicMmhg: evt.diastolic,
        pulseBpm: evt.pulseBpm ?? evt.pulseRate,
        // Prefer device-supplied classification; fall back to local computation.
        bloodPressureClassification: evt.classification ?? classifyBP(evt.systolic, evt.diastolic),
      },
    };
    const patch = fieldMap[evt.type];
    if (!patch || Object.values(patch).every((value) => value == null)) return;

    if (evt.type === "blood_pressure_reading" && patch.bloodPressure != null) {
      clearTimeout(captureTimerRef.current);
      clearTimeout(bpTimeoutRef.current);
      bpTimeoutRef.current = null;
      setBpWaiting(false);
      setBpNoReading(false);
      setSensorFailed(false);
    }

    setReadings((prev) => ({ ...prev, ...patch }));
    if (mobileSensorSessionIdRef.current) void publishMobileReadingPatch(patch);
  }

  deviceEventHandlerRef.current = handleDeviceEvent;

  async function handleManualSubmit(studentId, signal) {
    const found = await lookupStudent(studentId, { signal });
    if (!found) throw new Error("Student ID not found");
    setStudent(found);
    setStep("confirm");
  }

  async function handleConfirmYes() {
    setStep("serviceAccess");
    if (!supabase) return;

    const existingSessionId = currentSessionIdRef.current || serviceSessionId;
    if (existingSessionId) {
      try {
        const { data, error } = await supabase.from("kiosk_sessions")
          .update({ status: "awaiting_service_selection" })
          .eq("id", existingSessionId)
          .in("status", ["tap_logged", "awaiting_service_selection"])
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (data?.id) {
          currentSessionIdRef.current = data.id;
          setServiceSessionId(data.id);
          setServiceSessionReady(true);
        } else {
          setServiceSessionReady(true);
        }
      } catch (error) {
        console.warn("[handleConfirmYes] Could not prepare phone service selection:", error);
        setServiceSessionReady(true);
      }
      return;
    }

    try {
      const { data, error } = await supabase.from("kiosk_sessions").insert([{
        rfid_uid: student?.rfidTagUid || student?.studentId,
        status: "awaiting_service_selection",
      }]).select("id").single();
      if (error) throw error;
      currentSessionIdRef.current = data.id;
      setServiceSessionId(data.id);
      setServiceSessionReady(true);
    } catch (error) {
      console.warn("[handleConfirmYes] Could not create phone service selection session:", error);
      setServiceSessionReady(true);
    }
  }

  function handleRescanId() {
    resetSession();
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
    if (!mobileMode) triggerHardwareSensors("temperature", "Prescription/OTC Pickup");
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

function handleKioskServiceSelect(value) {
  if (mobileMode) {
    handleServiceSelect(value);
    return;
  }
  const sessionId = currentSessionIdRef.current;
  if (sessionId && supabase) {
    void supabase.from("kiosk_sessions").update({ status: "cancelled" })
      .eq("id", sessionId).eq("status", "awaiting_service_selection");
  }
  currentSessionIdRef.current = null;
  setServiceSessionId(null);
  setServiceSessionReady(false);
  handleServiceSelect(value);
}
function toggleMedicineSymptom(symptom) {
  setMedicineSymptoms((current) => current.includes(symptom)
    ? current.filter((item) => item !== symptom)
    : [...current, symptom]);
}

async function handleMedicineSubmit() {
  if (submittingRef.current || (!mobileMode && readings.temperatureC == null) || medicineSymptoms.length === 0 || Object.keys(medicineSafetyAnswers).length < 3) return;
  submittingRef.current = true;
  const temperatureC = readings.temperatureC == null ? null : Number(readings.temperatureC);
  const temperatureClass = classifyTemp(temperatureC);
  const reasonText = medicineSymptoms
    .map((symptom) => symptom === "Others" ? `Others: ${medicineOtherText.trim()}` : symptom)
    .join(", ");
  try {
    const result = await submitIntake({
      studentId: student?.studentId || student?.rfidTagUid,
      serviceType: "Prescription/OTC Pickup",
      source: "kiosk",
      reason: reasonText.length > 60 ? `${reasonText.slice(0, 57)}...` : reasonText,
      temperatureC,
      requestDetails: JSON.stringify({ symptoms: medicineSymptoms, safetyAnswers: medicineSafetyAnswers }),
    });
    if (!mobileMode) currentSessionIdRef.current = null;
    setResultQueueNumber(result?.queueEntry?.queueNumber ?? null);
    setOverrideTriggered(temperatureClass != null && temperatureClass !== "Normal");
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
  if (!mobileMode) await triggerHardwareSensors("temperature");
}

function handleToggleComplaint(key) {
  setWalkInComplaints((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
  );
}

async function handleLeaveWalkIn() {
  clearTimeout(captureTimerRef.current);
  setSensorFailed(false);
  const sessionId = mobileMode ? null : currentSessionIdRef.current;
  if (!mobileMode) currentSessionIdRef.current = null;
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
  if ((!mobileMode && temperatureC == null) || walkInComplaints.length === 0) return;

  submittingRef.current = true;
  clearTimeout(captureTimerRef.current);

  const serviceType = consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation";
  const complaintText = walkInComplaints
    .map((k) => k === "others" ? `Others: ${walkInOtherText.trim()}` : COMPLAINTS.find((c) => c.key === k)?.label ?? k)
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
    if (!mobileMode) currentSessionIdRef.current = null;
    setOverrideTriggered(temperatureC != null && classifyTemp(temperatureC) !== "Normal");
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

async function handleContinueAtKiosk() {
  const sessionId = currentSessionIdRef.current;
  if (sessionId && supabase) {
    void supabase.from("kiosk_sessions").update({ status: "cancelled" })
      .eq("id", sessionId).eq("status", "awaiting_service_selection");
  }
  currentSessionIdRef.current = null;
  setServiceSessionId(null);
  setServiceSessionReady(false);
  setStep("service");
}

async function handleMobileCancel() {
  const sessionId = currentSessionIdRef.current;
  if (sessionId && supabase) {
    try {
      await supabase.from("kiosk_sessions").update({ status: "awaiting_service_selection" })
        .eq("id", sessionId).in("status", ["mobile_flow_started", "mobile_sensor_requested", "mobile_readings_ready"]);
    } catch (error) {
      console.warn("[handleMobileCancel] Could not release the mobile session:", error);
    }
  }
  setMobileSessionStatus("cancelled");
}

async function handleMobileDone() {
  const sessionId = currentSessionIdRef.current;
  if (sessionId && supabase) {
    try {
      await supabase.from("kiosk_sessions").update({ status: "completed" })
        .eq("id", sessionId).in("status", ["mobile_flow_started", "mobile_readings_ready"]);
    } catch (error) {
      console.warn("[handleMobileDone] Could not close the mobile session:", error);
    }
  }
  await resetSession("completed");
  setMobileFlowComplete(true);
}

async function handleMobileVitalsSubmit(values) {
  const finalReadings = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  if (finalReadings.systolicMmhg != null && finalReadings.diastolicMmhg != null) {
    finalReadings.bloodPressure = `${finalReadings.systolicMmhg}/${finalReadings.diastolicMmhg}`;
    finalReadings.bloodPressureClassification = classifyBP(finalReadings.systolicMmhg, finalReadings.diastolicMmhg);
  }
  setReadings(finalReadings);
  setManualFields(Object.keys(finalReadings));
  await finishCapture(finalReadings);
}

async function requestMobileSensorReadings(mode) {
  if (!mobileMode || !supabase || !currentSessionIdRef.current) {
    setMobileSessionError("The kiosk sensor connection is unavailable. Please ask clinic staff to continue at the kiosk.");
    setStep("mobileSensorWaiting");
    return;
  }
  setCaptureMode(mode);
  setFlowType("screening");
  setMobileSessionError("");
  setReadings({});
  setStep("mobileSensorWaiting");
  const { data: stoppedRequest } = await supabase.from("kiosk_sessions").update({ status: "mobile_flow_started" })
    .eq("id", currentSessionIdRef.current).eq("status", "mobile_sensor_requested").select("id").maybeSingle();
  if (stoppedRequest) await new Promise((resolve) => window.setTimeout(resolve, 500));
  const sensorMode = mode === "bmi" ? "physical" : mode;
  const { error } = await supabase.from("kiosk_sessions")
    .update({ status: "mobile_sensor_requested", sensor_required: sensorMode })
    .eq("id", currentSessionIdRef.current)
    .in("status", ["mobile_flow_started", "mobile_readings_ready"]);
  if (error) {
    console.warn("[requestMobileSensorReadings] Could not request kiosk readings:", error);
    setStep("mobileSensorWaiting");
    setMobileSessionError("The kiosk could not start the sensors. Please try again or ask clinic staff for help.");
  }
}

async function handleMobileSensorBack() {
  const sessionId = currentSessionIdRef.current;
  if (sessionId && supabase) {
    await supabase.from("kiosk_sessions").update({ status: "mobile_flow_started" })
      .eq("id", sessionId).eq("status", "mobile_sensor_requested");
  }
  setStep("screeningOptions");
}

async function handleMobileManualReadings() {
  await handleMobileSensorBack();
  setStep("mobileVitalsEntry");
}

async function handleMobileUseSensorReadings() {
  setFlowType("screening");
  await finishCapture(readings);
}

function handleReturnToKiosk() {
  const sessionId = currentSessionIdRef.current;
  if (sessionId && supabase) {
    void supabase.from("kiosk_sessions").update({ status: "awaiting_service_selection" })
      .eq("id", sessionId).eq("status", "mobile_flow_started");
  }
  setStep("service");
}

async function handleScreeningOptionSelect(mode) {
    if (mobileMode) {
      submittingRef.current = false;
      setReadings({});
      setManualFields([]);
      setCaptureMode(mode);
      setFlowType("screening");
      void requestMobileSensorReadings(mode);
      return;
    }
    submittingRef.current = false;
    if (!mobileMode) currentSessionIdRef.current = null;
    setReadings({});
    setManualFields([]);
    clearTimeout(bpTimeoutRef.current);
    setBpNoReading(false);
    setBpWaiting(false);
    setCaptureMode(mode);
    setFlowType("screening");
    setStep("capturing");

    const needsBp = mode === "bloodPressure" || mode === "complete";
    if (needsBp) {
      setBpWaiting(true);
      bpTimeoutRef.current = setTimeout(() => {
        setBpWaiting(false);
        setBpNoReading(true);
        setSensorFailed(true);
      }, BP_READING_TIMEOUT_MS);
    }
    const sensorMode = mode === "bmi" ? "physical" : mode;
    await triggerHardwareSensors(sensorMode, "Quick Health Screening");
  }

  async function handleCancelScreening() {
    clearTimeout(captureTimerRef.current);
    clearTimeout(bpTimeoutRef.current);
    bpTimeoutRef.current = null;
    setSensorFailed(false);
    setBpNoReading(false);
    setBpWaiting(false);
    if (flowType === "mobileSensorCapture") {
      const sensorSessionId = currentSessionIdRef.current;
      if (sensorSessionId && supabase) void supabase.from("kiosk_sessions").update({ status: "cancelled" }).eq("id", sensorSessionId).eq("status", "pending_sensor");
      currentSessionIdRef.current = mobileSensorSessionIdRef.current;
      mobileSensorSessionIdRef.current = null;
      submittingRef.current = false;
      setReadings({});
      setFlowType(null);
      setCaptureMode(null);
      setStep("mobileWaiting");
      return;
    }
    const sessionId = currentSessionIdRef.current;
    currentSessionIdRef.current = null;
    submittingRef.current = false;
    setReadings({});
    setCaptureMode(null);
    setFlowType(null);
    setStep("screeningOptions");
    if (sessionId && supabase) {
      try {
        await supabase.from("kiosk_sessions").update({ status: "cancelled" }).eq("id", sessionId).in("status", ["pending_sensor", "tap_logged"]);
      } catch (error) {
        console.warn("[handleCancelScreening] Failed to cancel sensor session:", error);
      }
    }
  }

  async function handleRetryScreening() {
    const mode = captureMode;
    if (!mode) return;
    await handleCancelScreening();
    await handleScreeningOptionSelect(mode);
  }

  async function handleManualScreeningEntry() {
    clearTimeout(captureTimerRef.current);
    clearTimeout(bpTimeoutRef.current);
    bpTimeoutRef.current = null;
    const sessionId = currentSessionIdRef.current;
    if (!mobileMode) currentSessionIdRef.current = null;
    if (sessionId && supabase) {
      try { await supabase.from("kiosk_sessions").update({ status: "cancelled" }).eq("id", sessionId).in("status", ["pending_sensor", "tap_logged"]); }
      catch (error) { console.warn("[handleManualScreeningEntry] Failed to cancel sensor request:", error); }
    }
    setBpWaiting(false);
    setBpNoReading(captureMode === "complete");
    setSensorFailed(false);
    setStep("vitalsEntry");
  }

  async function triggerHardwareSensors(sensorCmd, selectedService = null) {
    clearTimeout(captureTimerRef.current);
    setSensorFailed(false);
    currentSessionIdRef.current = null;

    if (isMock) {
      window.setTimeout(() => {
        if (sensorCmd === "complete" || sensorCmd === "temperature") bridgeRef.current?.simulateTemperature?.();
        if (sensorCmd === "complete" || sensorCmd === "physical") bridgeRef.current?.simulateHeightWeight?.();
        if (sensorCmd === "complete" || sensorCmd === "bloodPressure") bridgeRef.current?.simulateBloodPressure?.();
      }, 350);
    } else if (supabase) {
      try {
        const { data, error } = await supabase.from("kiosk_sessions").insert([{
          rfid_uid: student?.rfidTagUid || student?.studentId,
          service_selected: selectedService || (flowType === "consultation"
            ? `${consultSubType === "Dental" ? "Dental" : "Medical"} Consultation`
            : "Quick Health Screening"),
          sensor_required: sensorCmd,
          status: "pending_sensor",
        }]).select("id").single();
        if (error) throw error;
        if (data?.id) currentSessionIdRef.current = data.id;
      } catch (err) {
        console.warn("[triggerHardwareSensors] Supabase sensor request failed:", err);
      }
    }

    const timeoutMs = sensorCmd === "complete" || sensorCmd === "bloodPressure"
      ? BP_READING_TIMEOUT_MS
      : sensorCmd === "physical" ? 14_000 : 12_000;
    captureTimerRef.current = setTimeout(() => {
      console.warn("[triggerHardwareSensors] No sensor data received from hardware within timeout.");
      setSensorFailed(true);
    }, timeoutMs);
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
    if (sensorCmd === "complete" && !bpNoReading) {
      clearTimeout(bpTimeoutRef.current);
      setBpWaiting(true);
      bpTimeoutRef.current = setTimeout(() => {
        setBpWaiting(false);
        setBpNoReading(true);
      }, BP_READING_TIMEOUT_MS);
    }
    await triggerHardwareSensors(sensorCmd);
  }

  async function handleFullAutoScan() {
    const mode = captureMode || "complete";
    setReadings({});
    setManualFields([]);
    const sensorCmd = mode === "complete" ? "complete" : mode === "temperature" ? "temperature" : "physical";
    setStep("capturing");
    if (sensorCmd === "complete") {
      clearTimeout(bpTimeoutRef.current);
      setBpNoReading(false);
      setBpWaiting(true);
      bpTimeoutRef.current = setTimeout(() => {
        setBpWaiting(false);
        setBpNoReading(true);
      }, BP_READING_TIMEOUT_MS);
    }
    await triggerHardwareSensors(sensorCmd);
  }

  async function finishCapture(finalReadings) {
    submittingRef.current = true;
    if (flowType === "mobileSensorCapture") {
      const sessionId = mobileSensorSessionIdRef.current;
      if (!sessionId || !supabase) {
        submittingRef.current = false;
        setSensorFailed(true);
        return;
      }
      const pressure = finalReadings.bloodPressure ?? (finalReadings.systolicMmhg != null && finalReadings.diastolicMmhg != null
        ? `${finalReadings.systolicMmhg}/${finalReadings.diastolicMmhg}` : null);
      const { error } = await supabase.from("kiosk_sessions").update({
        status: "mobile_readings_ready",
        temp_c: finalReadings.temperatureC ?? null,
        height_m: finalReadings.heightCm != null ? Number(finalReadings.heightCm) / 100 : null,
        weight_kg: finalReadings.weightKg ?? null,
        blood_pressure: pressure,
        systolic_mmhg: finalReadings.systolicMmhg ?? null,
        diastolic_mmhg: finalReadings.diastolicMmhg ?? null,
        pulse_bpm: finalReadings.pulseBpm ?? null,
        bp_classification: finalReadings.bloodPressureClassification ?? null,
      }).eq("id", sessionId).eq("status", "mobile_sensor_requested");
      if (error) {
        console.warn("[finishCapture] Could not send readings to the phone:", error);
        submittingRef.current = false;
        setSensorFailed(true);
        return;
      }
      clearTimeout(captureTimerRef.current);
      clearTimeout(bpTimeoutRef.current);
      bpTimeoutRef.current = null;
      currentSessionIdRef.current = sessionId;
      mobileSensorSessionIdRef.current = null;
      submittingRef.current = false;
      setBpWaiting(false);
      setFlowType(null);
      setStep("mobileWaiting");
      return;
    }
    if (!mobileMode) currentSessionIdRef.current = null;
    const targetStudentId = student?.studentId || student?.rfidTagUid;
    if (!targetStudentId) {
      submittingRef.current = false;
      if (mobileMode) throw new Error("Student verification is missing. Go back and restart check-in.");
      alert("Please verify the student before saving these readings.");
      await resetSession("cancelled");
      return;
    }

    try {
      if (flowType === "consultation") {
        const serviceType = consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation";
        const result = await submitIntake({
          studentId: targetStudentId,
          serviceType,
          source: "kiosk",
          temperatureC: finalReadings.temperatureC,
          bloodPressure: finalReadings.bloodPressure,
          bloodPressureClassification: finalReadings.bloodPressureClassification,
          pulseRate: finalReadings.pulseBpm,
          heightCm: finalReadings.heightCm,
          weightKg: finalReadings.weightKg,
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
        pulseRate: finalReadings.pulseBpm,
        heightCm: finalReadings.heightCm,
        weightKg: finalReadings.weightKg,
      });
      setOverrideTriggered(!!result.overrideTriggered);
      setResultQueueNumber(result.queueEntry?.queueNumber ?? null);
      setStep("result");
    } catch (err) {
      console.warn("[finishCapture] API intake submission fallback:", err);
      submittingRef.current = false;
      if (mobileMode) throw new Error("The readings could not be saved. Please try again or contact clinic staff.");
      alert("The readings could not be saved to the clinic server. Please repeat the screening or contact clinic staff.");
      await resetSession("cancelled");
    }
  }

  const walkInTemp = readings.temperatureC != null ? Number(readings.temperatureC) : null;
  const onFlowDone = mobileMode ? handleMobileDone : resetSession;

  return (
    <div className={mobileSessionToken ? "mobile-checkin-app" : undefined} onClick={isOnline ? resetIdleTimer : undefined}>
      {mobileSessionToken && mobileSessionStatus === "loading" && <main className="mobile-session-status"><h1>Starting mobile check-in</h1><p>Verifying your student record…</p></main>}
      {mobileSessionToken && mobileSessionStatus === "error" && <main className="mobile-session-status"><h1>Unable to start check-in</h1><p>{mobileSessionError}</p><button onClick={() => window.location.assign(window.location.pathname)}>Return to kiosk</button></main>}
      {mobileSessionToken && mobileSessionStatus === "cancelled" && <main className="mobile-session-status"><h1>Check-in cancelled</h1><p>Your kiosk session is ready again. Scan the QR code to restart or continue at the kiosk.</p><button onClick={() => window.location.assign(window.location.pathname)}>Done</button></main>}
      {mobileSessionToken && mobileFlowComplete && <main className="mobile-session-status"><h1>Check-in complete</h1><p>Your request has been submitted. You may close this page.</p><button onClick={() => window.location.assign(window.location.pathname)}>Done</button></main>}
      {(!mobileSessionToken || (mobileMode && !mobileFlowComplete)) && <>
      {mobileMode && <div className="mobile-checkin-toolbar"><strong>Mobile check-in</strong><button onClick={handleMobileCancel}>Cancel check-in</button></div>}
      {step === "mobileWaiting" && <main className="mobile-session-status"><h1>Continue check-in on your phone</h1><p>Your student record is verified. Continue the service selection and check-in on your phone.</p><button onClick={handleReturnToKiosk}>Continue at kiosk instead</button></main>}
      {step === "offline" && <OfflineScreen onRetry={() => window.dispatchEvent(new Event("online"))} />}

      {step === "welcome" && <WelcomeScreen onManualEntry={() => setStep("manual")} />}

      {step === "manual" && (
        <ManualEntryScreen onSubmit={handleManualSubmit} onCancel={resetSession} isOnline={isOnline} />
      )}

      {step === "confirm" && (
        <IdentityVerificationScreen student={student} onProceed={handleConfirmYes} onBack={handleConfirmNo} onRescan={handleRescanId} onFaq={openFaq} isOnline={isOnline} />
      )}

      {step === "service" && (
        <ServiceSelectScreen onSelect={handleKioskServiceSelect} onBack={() => setStep("confirm")} onFaq={openFaq} isOnline={isOnline} mobileMode={mobileMode} />
      )}

      {step === "mobileVitalsEntry" && <MobileVitalsEntryScreen mode={captureMode} onSubmit={handleMobileVitalsSubmit} onBack={() => setStep("screeningOptions")} isOnline={isOnline} />}
      {step === "mobileSensorWaiting" && <MobileSensorReadingsScreen mode={captureMode} waiting error={mobileSessionError} onBack={handleMobileSensorBack} onManual={handleMobileManualReadings} onRetry={() => requestMobileSensorReadings(captureMode)} isOnline={isOnline} />}
      {step === "mobileSensorReview" && <MobileSensorReadingsScreen mode={captureMode} readings={readings} onBack={handleMobileSensorBack} onRetry={() => requestMobileSensorReadings(captureMode)} onContinue={handleMobileUseSensorReadings} isOnline={isOnline} />}

      {step === "serviceAccess" && <QrChoiceScreen
        url={serviceSessionId && serviceSessionReady ? `${window.location.origin}${window.location.pathname}?mobileServiceSession=${encodeURIComponent(serviceSessionId)}` : null}
        preparing={!!supabase && !serviceSessionReady}
        onContinue={handleContinueAtKiosk}
        onBack={() => setStep("confirm")}
        isOnline={isOnline}
      />}

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
    onFaq={openFaq}
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
    onFaq={openFaq}
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
    onFaq={openFaq}
    isOnline={isOnline}
  />
)}

{step === "clearanceIntake" && (
  <ClearanceIntakeScreen
    onSubmit={handleClearanceSubmit}
    onBack={() => setStep("clearanceEntry")}
    onFaq={openFaq}
    isOnline={isOnline}
  />
)}

      {step === "clearanceResult" && (
  <ClearanceResultScreen
    queueNumber={clearanceQueueNumber}
    onDone={onFlowDone}
    onFaq={openFaq}
    isOnline={isOnline}
  />
)}

{step === "appointmentBooking" && (
  <AppointmentBookingScreen
    consultSubType={consultSubType}
    serviceType={consultSubType === "Dental" ? "Dental Consultation" : "Medical Consultation"}
    onProceed={handleAppointmentProceed}
    onFaq={openFaq}
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
    onFaq={openFaq}
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
    onDone={onFlowDone}
    onFaq={openFaq}
    isOnline={isOnline}
  />
)}

{step === "appointmentConfirmed" && appointmentSelection && clearanceAppointmentPurpose && (
  <AppointmentConfirmedScreen
    serviceLabel="MEDICAL CLEARANCE"
    purposeLabel={clearanceAppointmentPurpose}
    dateLabel={appointmentSelection.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
    timeLabel={appointmentSelection.time}
    onDone={onFlowDone}
    onFaq={openFaq}
    isOnline={isOnline}
  />
)}

{step === "walkInIntake" && (
  <WalkInIntakeScreen
    consultSubType={consultSubType}
    selectedComplaints={walkInComplaints}
            onToggleComplaint={handleToggleComplaint}
            otherText={walkInOtherText}
            onOtherTextChange={setWalkInOtherText}
            temperatureC={walkInTemp}
            mobileMode={mobileMode}
            onTemperatureChange={(value) => setReadings((current) => ({ ...current, temperatureC: value }))}
            sensorFailed={sensorFailed}
            onRetry={() => triggerHardwareSensors("temperature", "Consultation")}
    onContinue={handleWalkInSubmit}
    onFaq={openFaq}
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
    onTimeout={onFlowDone}
    onFaq={openFaq}
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
          mobileMode={mobileMode}
          onTemperatureChange={(value) => setReadings((current) => ({ ...current, temperatureC: value }))}
          sensorFailed={sensorFailed}
          onRetry={() => triggerHardwareSensors("temperature", "Prescription/OTC Pickup")}
          onToggleSymptom={toggleMedicineSymptom}
          otherText={medicineOtherText}
          onOtherTextChange={setMedicineOtherText}
          onAnswerSafety={(question, answer) => setMedicineSafetyAnswers((current) => ({ ...current, [question]: answer }))}
          onContinue={handleMedicineSubmit}
          onFaq={openFaq}
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
          onTimeout={onFlowDone}
          onFaq={openFaq}
          isOnline={isOnline}
        />
      )}

      {step === "requestText" && (
        <RequestTextScreen onSubmit={handleRequestTextSubmit} onBack={() => setStep("service")} isOnline={isOnline} />
      )}

      {step === "checkedIn" && (
        <CheckedInScreen info={checkInInfo} onDone={onFlowDone} isOnline={isOnline} />
      )}

      {step === "screeningOptions" && (
        <ScreeningOptionsScreen onSelect={handleScreeningOptionSelect} onBack={() => setStep("service")} onFaq={openFaq} isOnline={isOnline} />
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
            sensorFailed={sensorFailed}
            pulseBpm={readings.pulseBpm}
            bpNoReading={bpNoReading}
            bpWaiting={bpWaiting}
            onManual={handleManualScreeningEntry}
            onBack={handleCancelScreening}
            onRetry={handleRetryScreening}
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
            onRetry={() => triggerHardwareSensors(captureMode || "complete")}
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
            bpNoReading={bpNoReading}
            bpWaiting={bpWaiting}
            isResult
            onDone={onFlowDone}
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
            onDone={onFlowDone}
            isOnline={isOnline}
          />
        )
      )}
      {step === "faq" && <KioskFaqScreen onBack={() => setStep(faqReturnStep)} isOnline={isOnline} />}
      </>}

    </div>
  );
}
