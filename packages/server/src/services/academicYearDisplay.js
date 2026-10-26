import AcademicCalendar from "../models/AcademicCalendar.js";
import { decoratePatientYearLevel, parseAcademicYearStart } from "./patientInformation.js";

export async function getConfiguredAcademicYear() {
  const setting = await AcademicCalendar.findOne({ key: "current" }).select("currentAcademicYear").lean();
  const configured = setting?.currentAcademicYear || process.env.HSO_CURRENT_ACADEMIC_YEAR || "";
  return parseAcademicYearStart(configured) ? configured : null;
}

export async function decoratePatients(patients) {
  const academicYear = await getConfiguredAcademicYear();
  return (Array.isArray(patients) ? patients : [patients]).map((patient) => decoratePatientYearLevel(patient, academicYear));
}
