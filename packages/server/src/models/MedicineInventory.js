import mongoose from "mongoose";

const medicineInventorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  genericName: { type: String, trim: true, maxlength: 120 },
  category: { type: String, enum: ["Medicine", "First Aid", "Medical Supply", "Other"], default: "Medicine" },
  quantity: { type: Number, required: true, min: 0, default: 0, validate: { validator: Number.isInteger, message: "Quantity must be a whole number" } },
  unit: { type: String, required: true, trim: true, maxlength: 30, default: "units" },
  reorderLevel: { type: Number, min: 0, default: 5, validate: { validator: Number.isInteger, message: "Reorder level must be a whole number" } },
  expiryDate: Date,
  batchNumber: { type: String, trim: true, maxlength: 80 },
  supplier: { type: String, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 1000 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("MedicineInventory", medicineInventorySchema);
