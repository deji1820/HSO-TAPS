function ascii(value) {
  return String(value ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function printableLabel(value) {
  return ascii(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function flatten(value, prefix = "") {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return [[prefix, value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ")]];
  if (typeof value !== "object") return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, item]) => flatten(item, prefix ? `${prefix} / ${key}` : key));
}

function wrap(text, maxLength = 92) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function pdfLiteral(value) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

/** Create a simple, printable, multi-page PDF from a kiosk health declaration payload. */
export function healthDeclarationToPdf(payload) {
  const textLines = [
    "Health Status Declaration",
    `Submitted: ${payload?.submittedAt ? new Date(payload.submittedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "Date not recorded"}`,
    "",
  ];
  for (const [key, value] of flatten(payload)) {
    textLines.push(...wrap(`${printableLabel(key)}: ${ascii(value)}`), "");
  }

  const linesPerPage = 49;
  const pageLines = [];
  for (let i = 0; i < textLines.length; i += linesPerPage) pageLines.push(textLines.slice(i, i + linesPerPage));
  if (!pageLines.length) pageLines.push(["Health Status Declaration"]);

  const objects = [];
  const pageIds = pageLines.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pageLines.forEach((lines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const commands = ["BT", "/F1 9 Tf", "50 790 Td"];
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push("0 -14 Td");
      if (lineIndex === 0 && index === 0) commands.push("/F1 16 Tf");
      if (lineIndex === 1 && index === 0) commands.push("/F1 9 Tf");
      commands.push(`(${pdfLiteral(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%HSO\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, "ascii");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}
