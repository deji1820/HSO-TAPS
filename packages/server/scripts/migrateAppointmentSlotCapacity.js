import "dotenv/config";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) throw new Error("Set MONGODB_URI before running the appointment slot-capacity migration.");

try {
  await mongoose.connect(uri);
  const collection = mongoose.connection.collection("appointments");
  const indexes = await collection.indexes();
  for (const index of indexes) {
    const keys = Object.keys(index.key || {});
    if (keys.length === 3 && keys[0] === "serviceType" && keys[1] === "dateKey" && keys[2] === "timeSlot" && index.unique) {
      await collection.dropIndex(index.name);
      console.log(`Dropped legacy single-appointment slot index: ${index.name}`);
    }
  }

  await collection.updateMany({ slotNumber: { $exists: false } }, { $set: { slotNumber: 1 } });
  await collection.createIndex(
    { serviceType: 1, dateKey: 1, timeSlot: 1, slotNumber: 1 },
    {
      name: "serviceType_1_dateKey_1_timeSlot_1_slotNumber_1",
      unique: true,
      partialFilterExpression: { status: { $in: ["scheduled", "checked_in"] } },
    },
  );
  console.log("Appointment slot-capacity index is ready.");
} finally {
  await mongoose.disconnect();
}
