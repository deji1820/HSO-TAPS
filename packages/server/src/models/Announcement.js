import mongoose from "mongoose";
const announcementSchema = new mongoose.Schema({ key: { type: String, unique: true, default: "dashboard" }, text: { type: String, default: "Health Services Office announcements will appear here." } }, { timestamps: true });
export default mongoose.model("Announcement", announcementSchema);
