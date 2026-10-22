const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export async function sendDocumentStatusNotification(document, status, recipient = document.notificationEmail) {
  const email = String(recipient || "").trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!email) return { sent: false, reason: "No student email address is on file." };
  if (!apiKey || !from) return { sent: false, reason: "Email notifications are not configured on the server." };

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
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text: `Hello ${firstName},\n\n${descriptions[status]}\n\nIf you have questions, please contact the Health Services Office.`,
        html: `<p>Hello ${escapeHtml(firstName)},</p><p>${escapeHtml(descriptions[status])}</p><p>If you have questions, please contact the Health Services Office.</p>`,
      }),
    });
    if (!response.ok) {
      console.error(`[Email] Document ${status.toLowerCase()} notice failed (HTTP ${response.status}).`);
      return { sent: false, reason: "The email provider could not send the notification." };
    }
    document.notificationEmail = email;
    document.lastNotifiedStatus = status;
    document.notificationSentAt = new Date();
    await document.save();
    return { sent: true };
  } catch (error) {
    console.error(`[Email] Document ${status.toLowerCase()} notice failed: ${error.message}`);
    return { sent: false, reason: "The email provider could not be reached." };
  }
}
