function ascii(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7E]/g, " ");
}

function pdfLiteral(value) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function text(font, size, color, x, y, value) {
  return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfLiteral(value)}) Tj ET`;
}

function centered(font, size, color, y, value) {
  const content = ascii(value);
  const approximateWidth = content.length * size * 0.52;
  return text(font, size, color, Math.max(42, (595 - approximateWidth) / 2), y, content);
}

function makePdf(commands) {
  const stream = commands.join("\n");
  const objects = [
    null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [5 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n%HSO\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(pdf, "ascii");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index++) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export function consultationCompletionCertificateToPdf({ patient, serviceType, visitDate, providerName, providerRole, certificateReference }) {
  const issuedDate = new Date(visitDate || Date.now()).toLocaleDateString("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });
  const patientName = [patient?.firstName, patient?.middleName, patient?.lastName].filter(Boolean).join(" ") || "Patient";
  const patientId = patient?.studentId || patient?.employeeId || "Not recorded";
  const service = serviceType === "Dental Consultation" ? "Dental Consultation" : "Medical Consultation";
  const commands = [
    "q 0.055 0.20 0.43 rg 0 746 595 96 re f Q",
    "q 0.95 0.74 0.24 rg 0 738 595 8 re f Q",
    "q 0.055 0.20 0.43 RG 38 58 519 650 re S Q",
    centered("F2", 13, "1 1 1", 804, "NATIONAL UNIVERSITY FAIRVIEW"),
    centered("F2", 11, "1 1 1", 783, "HEALTH SERVICES OFFICE"),
    centered("F1", 9, "0.88 0.93 1", 765, "NU Fairview | Official Clinical Encounter Record"),
    centered("F2", 21, "0.055 0.20 0.43", 678, "CERTIFICATE OF COMPLETION"),
    "q 0.95 0.74 0.24 rg 208 660 179 3 re f Q",
    centered("F1", 12, "0.15 0.19 0.24", 610, "This certifies that"),
    centered("F2", 18, "0.055 0.20 0.43", 574, patientName),
    centered("F1", 11, "0.15 0.19 0.24", 549, `Patient ID: ${patientId}`),
    centered("F1", 12, "0.15 0.19 0.24", 496, "completed a clinic consultation with the"),
    centered("F2", 15, "0.055 0.20 0.43", 467, "NU Fairview Health Services Office"),
    centered("F1", 12, "0.15 0.19 0.24", 430, `Service: ${service}`),
    centered("F1", 12, "0.15 0.19 0.24", 402, `Date of completion: ${issuedDate}`),
    centered("F1", 10, "0.32 0.37 0.43", 358, "This certificate confirms that the consultation encounter was completed."),
    centered("F1", 10, "0.32 0.37 0.43", 340, "It does not include or replace the confidential clinical record."),
    "q 0.65 0.69 0.74 RG 90 208 m 505 208 l S Q",
    centered("F2", 12, "0.055 0.20 0.43", 183, providerName || "Authorized Provider"),
    centered("F1", 10, "0.32 0.37 0.43", 165, `${providerRole || "Provider"} | Health Services Office`),
    centered("F1", 8, "0.38 0.43 0.51", 91, `Certificate reference: ${certificateReference || "Issued upon completion"}`),
    centered("F1", 8, "0.38 0.43 0.51", 75, "Confidential patient document | National University Fairview"),
  ];
  return makePdf(commands);
}
