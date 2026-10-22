import nodemailer from "nodemailer";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function areDocumentNotificationsConfigured() {
  const provider = String(process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  if (provider === "gmail") return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  if (provider === "resend") return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return false;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export async function sendDocumentStatusNotification(document, status, recipient = document.notificationEmail) {
  const email = String(recipient || "").trim().toLowerCase();
  const provider = String(process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!email) return { sent: false, reason: "No student email address is on file." };
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (provider === "gmail" && (!gmailUser || !gmailAppPassword)) {
    return { sent: false, reason: "Gmail email settings are not configured on the server." };
  }
  if (provider === "resend" && (!apiKey || !from)) {
    return { sent: false, reason: "Resend email settings are not configured on the server." };
  }
  if (!["gmail", "resend"].includes(provider)) return { sent: false, reason: "Unsupported email provider." };

  const firstName = document.student?.firstName || "student";
  const descriptions = {
    Pending: "Your document submission has been received and is pending review by the Health Services Office.",
    Verified: "Your document submission has been reviewed and verified by the Health Services Office.",
    Rejected: "Your document submission has been reviewed and was not accepted by the Health Services Office. Please contact the office for next steps.",
  };
  const subject = {
    Pending: "Health Services document submission received",
    Verified: "Health Services document submission verified",
    Rejected: "Health Services document submission update",
  }[status];
  if (!subject || !descriptions[status]) return { sent: false, reason: "Unsupported document status." };

  try {
    const message = {
      to: email,
      subject,
      text: `Hello ${firstName},\n\n${descriptions[status]}\n\nIf you have questions, please contact the Health Services Office.`,
      html: `<p>Hello ${escapeHtml(firstName)},</p><p>${escapeHtml(descriptions[status])}</p><p>If you have questions, please contact the Health Services Office.</p>`,
    };
    if (provider === "gmail") {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        auth: { user: gmailUser, pass: gmailAppPassword.replace(/\s/g, "") },
      });
      await transporter.sendMail({ ...message, from: `HSO Health Services <${gmailUser}>` });
    } else {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, from, to: [email] }),
      });
      if (!response.ok) {
        console.error(`[Email] Document ${status.toLowerCase()} notice failed (HTTP ${response.status}).`);
        return { sent: false, reason: "The email provider could not send the notification." };
      }
    }
    document.notificationEmail = email;
    document.lastNotifiedStatus = status;
    document.notificationSentAt = new Date();
    await document.save();
    return { sent: true };
  } catch (error) {
    console.error(`[Email] Document ${status.toLowerCase()} notice failed: ${error.message}`);
    return { sent: false, reason: "The email provider could not send the notification. Check its server settings." };
  }
}
