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
import { lookupStudent, submitIntake } from "./services/api.js";
import { startHealthMonitor } from "./services/healthCheck.js";
import ConsultationEntryScreen from "./screens/ConsultationEntryScreen.jsx";
import WalkInIntakeScreen, { COMPLAINTS, classifyTemp } from "./screens/WalkInIntakeScreen.jsx";
import WalkInResultScreen from "./screens/WalkInResultScreen.jsx";

const IDLE_TIMEOUT_MS = 30_000;
const isMock = import.meta.env.VITE_MOCK_HARDWARE === "true";

// Which readings each screening mode needs before we can move to the result screen
const REQUIRED_FIELDS = {
  complete: ["temperatureC", "heightCm", "weightKg"],
  temperature: ["temperatureC"],
  physical: ["heightCm", "weightKg"],
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

  // Which multi-step flow is currently in progress Ã¢â‚¬â€ determines what
  // finishCapture() submits and where it routes afterwards.
  const [flowType, setFlowType] = useState(null);
  const [consultSubType, setConsultSubType] = useState(null); // "Medical" | "Dental"
  const [otherServiceSubType, setOtherServiceSubType] = useState(null); // "Prescription/OTC" | "General Inquiry"
  const [checkInInfo, setCheckInInfo] = useState(null); // shown on CheckedInScreen
  const [walkInComplaints, setWalkInComplaints] = useState([]); // array of complaint keys

  const bridgeRef = useRef(null);
  const idleTimer = useRef(null);
  const captureTimerRef = useRef(null);
  const stepRef = useRef(step);
  const submittingRef = useRef(false); // guards against double-submit
  const currentSessionIdRef = useRef(null);

  useEffect(() => { stepRef.current = step; }, [step]);

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
          const { height_m, temp_c, weight_kg } = payload.new;
          const patch = {};
          if (temp_c != null) patch.temperatureC = temp_c;
          if (height_m != null) patch.heightCm = height_m * 100;
          if (weight_kg != null) patch.weightKg = weight_kg;

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
    setSensorFailed(false);
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
    setStep("welcome");
    setWalkInComplaints([]);

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

    if (stepRef.current !== "capturing") return;

    const fieldMap = {
      temperature_reading: { temperatureC: evt.celsius },
      height_reading: { heightCm: evt.cm },
      weight_reading: { weightKg: evt.kg },
    };
    const patch = fieldMap[evt.type];
    if (!patch) return;

    setReadings((prev) => ({ ...prev, ...patch }));
  }

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
    handleOtherServiceTypeSelect("Prescription/OTC"); // goes to requestText
  } else {
    // "Medical Clearance": placeholder until we build its own screen
    submitIntake({ studentId: student.studentId, serviceType: value, source: "kiosk" }).finally(resetSession);
  }
}

  function handleConsultTypeSelect(subType) {
  setFlowType("consultation");
  setConsultSubType(subType);
  setStep("consultationEntry");
}

function handleBookAppointment() {
  // TODO: appointment booking isn't built yet
  alert("Appointment booking isn't available yet. Please choose Walk-in Consultation.");
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

  function handleScreeningOptionSelect(mode) {
    setCaptureMode(mode);
    setStep("vitalsEntry");
  }

  async function triggerHardwareSensors(sensorCmd) {
    clearTimeout(captureTimerRef.current);
    setSensorFailed(false);
    let sessionId = null;

    try {
      const { data } = await supabase.from("kiosk_sessions").insert([
        {
          rfid_uid: student?.rfidTagUid || student?.studentId,
          service_selected: flowType === "consultation" ? "Medical Consultation" : "Quick Health Screening",
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

      {step === "requestText" && (
        <RequestTextScreen onSubmit={handleRequestTextSubmit} onBack={() => setStep("otherServicesType")} isOnline={isOnline} />
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
      )}

      {step === "result" && (
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
      )}
    </div>
  );
}
