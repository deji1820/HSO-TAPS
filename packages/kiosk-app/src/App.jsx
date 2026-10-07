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

  const bridgeRef = useRef(null);
  const deviceEventHandlerRef = useRef(null);
  const idleTimer = useRef(null);
  const captureTimerRef = useRef(null);
  const stepRef = useRef(step);
  const submittingRef = useRef(false); // guards against double-submit
  const currentSessionIdRef = useRef(null);
  const bpTimeoutRef = useRef(null);

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
          if (!currentSessionIdRef.current || String(payload.new?.id) !== String(currentSessionIdRef.current)) return;
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
    const hasBpReading = readings.bloodPressure != null ||
      (readings.systolicMmhg != null && readings.diastolicMmhg != null);
    const bpRequiredForScreening = flowType === "screening" &&
      (captureMode === "complete" || captureMode === "bloodPressure");
    if (isComplete && (bpWaiting || (bpRequiredForScreening && !hasBpReading))) return;
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
    setWalkInOtherText("");
    setMedicineOtherText("");

    if (sessionIdToUpdate && supabase) {
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
  }

  deviceEventHandlerRef.current = handleDeviceEvent;

  async function handleManualSubmit(studentId, signal) {
    const found = await lookupStudent(studentId, { signal });
    if (!found) throw new Error("Student ID not found");
    setStudent(found);
    setStep("confirm");
  }

  function handleConfirmYes() {
    setStep("service");
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

  async function handleScreeningOptionSelect(mode) {
    submittingRef.current = false;
    currentSessionIdRef.current = null;
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
    currentSessionIdRef.current = null;
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
    currentSessionIdRef.current = null;
    const targetStudentId = student?.studentId || student?.rfidTagUid;
    if (!targetStudentId) {
      submittingRef.current = false;
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
      alert("The readings could not be saved to the clinic server. Please repeat the screening or contact clinic staff.");
      await resetSession("cancelled");
    }
  }

  const walkInTemp = readings.temperatureC != null ? Number(readings.temperatureC) : null;

  return (
    <div onClick={isOnline ? resetIdleTimer : undefined}>
      {step === "offline" && <OfflineScreen onRetry={() => window.dispatchEvent(new Event("online"))} />}

      {step === "welcome" && <WelcomeScreen onManualEntry={() => setStep("manual")} />}

      {step === "manual" && (
        <ManualEntryScreen onSubmit={handleManualSubmit} onCancel={resetSession} isOnline={isOnline} />
      )}

      {step === "confirm" && (
        <IdentityVerificationScreen student={student} onProceed={handleConfirmYes} onBack={handleConfirmNo} onRescan={handleRescanId} onFaq={openFaq} isOnline={isOnline} />
      )}

      {step === "service" && (
        <ServiceSelectScreen onSelect={handleServiceSelect} onBack={() => setStep("confirm")} onFaq={openFaq} isOnline={isOnline} />
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
    onDone={resetSession}
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
    onDone={resetSession}
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
    onDone={resetSession}
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
    onTimeout={resetSession}
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
          onTimeout={resetSession}
          onFaq={openFaq}
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
      {step === "faq" && <KioskFaqScreen onBack={() => setStep(faqReturnStep)} isOnline={isOnline} />}

    </div>
  );
}
