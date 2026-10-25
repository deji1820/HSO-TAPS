import AppointmentNotification from "../models/AppointmentNotification.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function areDocumentNotificationsConfigured() {
  const provider = String(process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  if (provider === "gmail") return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  if (provider === "gmail-api") {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
  }
  if (provider === "resend") return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return false;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function encodeMimeMessage({ from, to, subject, text }) {
  const safeHeader = (value) => String(value).replace(/[\r\n]+/g, " ");
  const mime = [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(to)}`,
    `Subject: ${safeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

async function sendWithGmailApi(message) {
  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenResponse.ok) {
    console.error(`[Email] Gmail API access token refresh failed (HTTP ${tokenResponse.status}).`);
    return false;
  }
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) return false;

  const raw = encodeMimeMessage({
    ...message,
    from: `HSO Health Services <${process.env.GMAIL_USER}>`,
  });
  const sendResponse = await fetch(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!sendResponse.ok) {
    console.error(`[Email] Gmail API send failed (HTTP ${sendResponse.status}).`);
    return false;
  }
  return true;
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
  if (provider === "gmail-api" && !areDocumentNotificationsConfigured()) {
    return { sent: false, reason: "Gmail API settings are not configured on the server." };
  }
  if (provider === "resend" && (!apiKey || !from)) {
    return { sent: false, reason: "Resend email settings are not configured on the server." };
  }
  if (!["gmail", "gmail-api", "resend"].includes(provider)) return { sent: false, reason: "Unsupported email provider." };

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
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        service: "gmail",
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        auth: { user: gmailUser, pass: gmailAppPassword.replace(/\s/g, "") },
      });
      await transporter.sendMail({ ...message, from: `HSO Health Services <${gmailUser}>` });
    } else if (provider === "gmail-api") {
      const sent = await sendWithGmailApi(message);
      if (!sent) return { sent: false, reason: "The email provider could not send the notification." };
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

export async function sendAppointmentDecisionNotification(appointment, decisionStatus, recipient = appointment.notificationEmail || appointment.student?.email) {
  const email = String(recipient || "").trim().toLowerCase();
  const provider = String(process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const descriptions = {
    pending: "Your appointment request has been received and is pending review by the Health Services Office. Please wait for an email with the decision before coming to the clinic.",
    accepted: "Your appointment request has been accepted by the Health Services Office.",
    rejected: "Your appointment request was rejected by the Health Services Office. Please contact the office to arrange another time.",
  };
  const subjects = {
    pending: "Health Services appointment request received",
    accepted: "Health Services appointment accepted",
    rejected: "Health Services appointment update",
  };
  const description = descriptions[decisionStatus];
  const subject = subjects[decisionStatus];
  if (!description || !subject) return { sent: false, reason: "Unsupported appointment notification." };
  const type = decisionStatus === "pending" ? "booking_received" : `decision_${decisionStatus}`;
  let notification;
  try {
    notification = await AppointmentNotification.create({
      appointment: appointment._id,
      type,
      recipient: email || undefined,
      subject,
      status: "queued",
    });
  } catch (error) {
    console.error("[Email] Appointment notification history could not be saved: " + error.message);
    return { sent: false, reason: "The appointment was saved, but email history could not be recorded." };
  }
  return deliverAppointmentNotification(appointment, notification, { email, provider, apiKey, from, gmailUser, gmailAppPassword, description, subject });
}

export async function retryAppointmentNotification(appointment, notification) {
  const descriptions = {
    booking_received: "Your appointment request has been received and is pending review by the Health Services Office. Please wait for an email with the decision before coming to the clinic.",
    decision_accepted: "Your appointment request has been accepted by the Health Services Office.",
    decision_rejected: "Your appointment request was rejected by the Health Services Office. Please contact the office to arrange another time.",
  };
  const description = descriptions[notification.type];
  if (!description) return { sent: false, reason: "This notification type cannot be retried." };
  const provider = String(process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  return deliverAppointmentNotification(appointment, notification, {
    email: String(notification.recipient || "").trim().toLowerCase(),
    provider,
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    gmailUser: process.env.GMAIL_USER,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
    description,
    subject: notification.subject,
  });
}

async function deliverAppointmentNotification(appointment, notification, { email, provider, apiKey, from, gmailUser, gmailAppPassword, description, subject }) {
  const claimed = await AppointmentNotification.findOneAndUpdate(
    { _id: notification._id, status: { $in: ["queued", "failed"] } },
    { $set: { status: "sending", attemptedAt: new Date() }, $unset: { failureReason: 1 }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!claimed) return { sent: false, reason: "This notification is already being sent or has already been sent." };

  const fail = async (reason) => {
    await AppointmentNotification.updateOne({ _id: claimed._id, status: "sending" }, { $set: { status: "failed", failureReason: reason } });
    return { sent: false, reason };
  };
  if (!email) return fail("No student email address is on file.");
  if (!areDocumentNotificationsConfigured()) return fail("Appointment email settings are not configured on the server.");
  if (!(["gmail", "gmail-api", "resend"].includes(provider))) return fail("Unsupported email provider.");
  const firstName = appointment.student?.firstName || "student";
  const purpose = appointment.purpose ? "\nPurpose: " + appointment.purpose : "";
  const text = "Hello " + firstName + ",\n\n" + description + "\n\nService: " + appointment.serviceType + "\nDate: " + appointment.dateKey + "\nTime: " + appointment.timeSlot + purpose + "\n\nIf you have questions, please contact the Health Services Office.";
  const html = "<p>Hello " + escapeHtml(firstName) + ",</p><p>" + escapeHtml(description) + "</p><p><strong>Service:</strong> " + escapeHtml(appointment.serviceType) + "<br><strong>Date:</strong> " + escapeHtml(appointment.dateKey) + "<br><strong>Time:</strong> " + escapeHtml(appointment.timeSlot) + (appointment.purpose ? "<br><strong>Purpose:</strong> " + escapeHtml(appointment.purpose) : "") + "</p><p>If you have questions, please contact the Health Services Office.</p>";

  try {
    const message = { to: email, subject, text, html };
    if (provider === "gmail") {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        service: "gmail", connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
        auth: { user: gmailUser, pass: gmailAppPassword.replace(/\s/g, "") },
      });
      await transporter.sendMail({ ...message, from: "HSO Health Services <" + gmailUser + ">" });
    } else if (provider === "gmail-api") {
      const sent = await sendWithGmailApi(message);
      if (!sent) return fail("The email provider could not send the appointment notice.");
    } else {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, from, to: [email] }),
      });
      if (!response.ok) {
        console.error("[Email] Appointment " + notification.type + " notice failed (HTTP " + response.status + ").");
        return fail("The email provider could not send the appointment notice.");
      }
    }
    await AppointmentNotification.updateOne({ _id: claimed._id, status: "sending" }, { $set: { status: "sent", sentAt: new Date(), failureReason: "" } });
    return { sent: true, notificationId: claimed._id };
  } catch (error) {
    console.error("[Email] Appointment " + notification.type + " notice failed: " + error.message);
    return fail("The email provider could not send the appointment notice.");
  }
}
