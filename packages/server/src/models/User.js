import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/** Staff/admin login accounts for the web portal. */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "superadmin", "supervisor", "nurse", "doctor", "physician", "dentist", "staff"], default: "staff" },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export default mongoose.model("User", userSchema);
