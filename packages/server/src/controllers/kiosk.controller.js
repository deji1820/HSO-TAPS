import Student from "../models/Student.js";
import VitalsLog from "../models/VitalsLog.js";
import QueueEntry from "../models/QueueEntry.js";
import { nextQueueNumber } from "../services/queueNumbering.service.js";

// Per HSO-TAP_SYSTEM_NOTES: Hypothermia < 35.5, Normal 35.5-37.5, Fever >= 37.8
// (37.6-37.7 is undefined in the notes; treated as Normal here)
const HYPOTHERMIA_BELOW_C = 35.5;
const FEVER_AT_OR_ABOVE_C = 37.8;

function classifyTemperature(t) {
  if (typeof t !== "number") return undefined;
  if (t < HYPOTHERMIA_BELOW_C) return "Hypothermia";
  if (t >= FEVER_AT_OR_ABOVE_C) return "Fever";
  return "Normal";
}

function classifyBmi(bmi) {
  if (bmi == null) return undefined;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

/**
 * POST /api/kiosk/intake
 * Called by kiosk-app at the end of ANY flow (self-service screening,
 * clinic consultation, or other services). Implements the decision-support
 * override: an abnormal temp during "self-service" forces entry + high priority.
 */
export async function submitIntake(req, res) {
  const io = req.app.get("io");
  const { studentId, serviceType, reason, requestDetails, temperatureC, bloodPressure, bloodPressureClassification, pulseRate, heightCm, weightKg, source } = req.body;

  const student = await Student.findOne({
    $or: [{ studentId }, { rfidTagUid: studentId?.toUpperCase() }],
  });
  if (!student) return res.status(404).json({ message: "Unknown student" });

  let bmi;
  if (heightCm && weightKg) {
    const heightM = heightCm / 100;
    bmi = +(weightKg / (heightM * heightM)).toFixed(1);
  }

  const temperatureStatus = classifyTemperature(temperatureC);
  const isFeverFlagged = temperatureStatus === "Fever";
  const isTempAlert = temperatureStatus === "Fever" || temperatureStatus === "Hypothermia";

  const vitals = await VitalsLog.create({
    student: student._id,
    source: source || "kiosk",
    temperatureC,
    temperatureStatus,
    bloodPressure,
    bloodPressureClassification,
    pulseRate,
    heightCm,
    weightKg,
    bmi,
    bmiCategory: classifyBmi(bmi),
    isFeverFlagged,
  });

  const isSelfService = serviceType === "Quick Health Screening";
  const needsQueueEntry = !isSelfService || isTempAlert; // the override rule

  let queueEntry = null;
  if (needsQueueEntry) {
    queueEntry = await QueueEntry.create({
      student: student._id,
      queueNumber: await nextQueueNumber(serviceType),
      priorityLevel: isTempAlert ? "High Priority" : isSelfService ? "Routine Check" : "Standard Priority",
      serviceType,
      reason: isTempAlert ? (isFeverFlagged ? "High Temperature" : "Low Temperature") : reason,
      requestDetails,
      linkedVitals: vitals._id,
    });
    io?.emit("queue:new", queueEntry); // pushes to Live Nurse/Doctor Dashboard in real time
  }

  res.status(201).json({
    vitals,
    queueEntry,
    overrideTriggered: isSelfService && isTempAlert,
    message:
      isSelfService && isTempAlert
        ? "Abnormal temperature detected — please proceed inside the clinic immediately."
        : undefined,
  });
}
