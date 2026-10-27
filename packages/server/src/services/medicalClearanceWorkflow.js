import { randomBytes } from "node:crypto";
import MedicalWorkflow from "../models/MedicalWorkflow.js";
import { findClearanceRequirement } from "./clearanceRequirements.js";

export function createMedicalClearanceWorkflow({ student, purpose, requestKey, queueEntry, fields = {}, physicalExamIncluded = false, laboratoryExamIncluded = false, actor }) {
  const configured = findClearanceRequirement(student.affiliation, purpose);
  if (!configured) throw new Error("That clearance purpose is not valid for this patient's affiliation.");
  const workflow = new MedicalWorkflow({
    student: student._id,
    ...(requestKey ? { requestKey } : {}),
    ...(queueEntry ? { queueEntry: queueEntry._id || queueEntry } : {}),
    service: "Medical Clearance",
    purpose: configured.purpose,
    affiliation: student.affiliation,
    initialFields: fields,
    physicalExamIncluded: Boolean(physicalExamIncluded),
    laboratoryExamIncluded: Boolean(laboratoryExamIncluded),
    documentSubmissionToken: randomBytes(32).toString("hex"),
    status: "assessment",
    requirements: configured.requirements.map((item) => ({
      text: item.text,
      kind: item.kind,
      required: item.conditional ? false : Boolean(item.required || item.kind === "action"),
      conditional: Boolean(item.conditional),
      condition: item.condition || "",
    })),
    events: [{ type: "created", description: "Medical clearance workflow created.", actor, at: new Date() }],
  });
  return workflow;
}
