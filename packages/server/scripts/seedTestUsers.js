import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";
import { connectDB } from "../src/config/db.js";

// Development-only accounts. All use the same deliberately published test password.
const TEST_PASSWORD = "HSOTest!2026";
const TEST_USERS = [
  { name: "Test Nurse", email: "nurse.test@nufv.edu.ph", role: "nurse" },
  { name: "Test Supervisor", email: "supervisor.test@nufv.edu.ph", role: "supervisor" },
  { name: "Test Super Admin", email: "superadmin.test@nufv.edu.ph", role: "superadmin" },
  { name: "Test Physician", email: "physician.test@nufv.edu.ph", role: "physician" },
  { name: "Test Dentist", email: "dentist.test@nufv.edu.ph", role: "dentist" },
  { name: "Test Staff", email: "staff.test@nufv.edu.ph", role: "staff" },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed test accounts in production.");
  }
  if (process.env.ALLOW_TEST_USER_SEED !== "true") {
    throw new Error("Set ALLOW_TEST_USER_SEED=true to explicitly enable local test-user seeding.");
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  const hostname = new URL(uri).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`Refusing to seed a non-local MongoDB host (${hostname}).`);
  }

  await connectDB();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  for (const account of TEST_USERS) {
    await User.findOneAndUpdate(
      { email: account.email },
      { ...account, passwordHash },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`Seeded ${TEST_USERS.length} local test accounts. Shared test password: ${TEST_PASSWORD}`);
  for (const { email, role } of TEST_USERS) console.log(`${role}\t${email}`);
}

main()
  .catch((error) => {
    console.error("Test-user seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
