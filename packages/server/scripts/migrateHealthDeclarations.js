import "dotenv/config";
import mongoose from "mongoose";
import ExternalDocument from "../src/models/ExternalDocument.js";
import Student from "../src/models/Student.js";
import { applyDeclarationToPatient, validateDeclaration } from "../src/services/patientInformation.js";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) throw new Error("Set MONGODB_URI before running the health declaration migration.");

mongoose.set("autoIndex", false);
await mongoose.connect(uri);
try {
  const canonical = await ExternalDocument.find({ recordType: "health_declaration" }).select("_id student submittedAt createdAt status verifiedAt submissionDetails").sort({ student: 1 }).lean();
  const rank = (record) => ({ Verified: 3, Pending: 2, Rejected: 1 }[record.status] || 0);
  const olderFirst = (a, b) => new Date(a.submittedAt || a.createdAt || 0) - new Date(b.submittedAt || b.createdAt || 0);
  const chooseCanonical = (records) => [...records].sort((a, b) => rank(b) - rank(a) || olderFirst(a, b))[0];
  const canonicalGroups = new Map();
  for (const record of canonical) {
    const patientId = String(record.student);
    canonicalGroups.set(patientId, [...(canonicalGroups.get(patientId) || []), record]);
  }
  const selectedByPatient = new Map();
  let duplicateCanonicalRecordsPreserved = 0;
  for (const [patientId, records] of canonicalGroups) {
    const selected = chooseCanonical(records);
    selectedByPatient.set(patientId, selected);
    for (const record of records) {
      if (record._id.equals(selected._id)) continue;
      await ExternalDocument.updateOne({ _id: record._id }, { $set: { recordType: "submission" } });
      duplicateCanonicalRecordsPreserved++;
    }
  }
  const legacy = await ExternalDocument.find({
    recordType: { $ne: "health_declaration" },
    $or: [
      { "submissionDetails.healthDeclaration": { $exists: true } },
      { documentTitle: /health status declaration/i },
    ],
  }).select("_id student submittedAt createdAt status verifiedAt submissionDetails").sort({ student: 1 }).lean();
  const legacyGroups = new Map();
  for (const record of legacy) {
    const patientId = String(record.student);
    legacyGroups.set(patientId, [...(legacyGroups.get(patientId) || []), record]);
  }
  let migrated = 0;
  let profilesSynchronized = 0;
  for (const [patientId, records] of legacyGroups) {
    if (selectedByPatient.has(patientId)) continue;
    const record = chooseCanonical(records);
    await ExternalDocument.updateOne({ _id: record._id, recordType: { $ne: "health_declaration" } }, { $set: { recordType: "health_declaration" } });
    selectedByPatient.set(patientId, record);
    migrated++;
  }
  for (const record of selectedByPatient.values()) {
    const patient = await Student.findById(record.student);
    const declaration = record.submissionDetails?.healthDeclaration;
    if (patient && declaration && !validateDeclaration(declaration, patient)) {
      applyDeclarationToPatient(patient, declaration, { _id: record._id, verifiedAt: record.verifiedAt }, record.status);
      await patient.save();
      profilesSynchronized++;
    }
  }
  await ExternalDocument.collection.createIndex({ student: 1, recordType: 1 }, { unique: true, partialFilterExpression: { recordType: "health_declaration" } });
  const legacyAgeCleanup = await Student.updateMany({ age: { $exists: true } }, { $unset: { age: 1 } });
  const duplicatesPreserved = legacy.length - migrated;
  console.log(JSON.stringify({ migrated, duplicatesPreserved, duplicateCanonicalRecordsPreserved, profilesSynchronized, legacyAgeValuesRemoved: legacyAgeCleanup.modifiedCount, note: "Verified declarations were preferred; older duplicate declarations were preserved as historical submission records." }, null, 2));
} finally {
  await mongoose.disconnect();
}
