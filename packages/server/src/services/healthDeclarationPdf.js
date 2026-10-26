const HEALTH_INDICATOR_QUESTIONS = [
  "Do you have any musculo-skeletal injury (e.g., fracture, ligament tear)?",
  "Do you have any allergies (e.g., food, medication)?",
  "Do you have any mental or behavioral health problems?",
  "Have you had any previous surgical procedures?",
  "Do you have an ongoing medical condition?",
  "Are you currently taking any medication?",
  "Have you ever been hospitalized for more than 1 day?",
  "Has a doctor ever denied or restricted your participation in sports or physical activities?",
  "Have you ever passed out or felt dizzy during or after exercise?",
  "Have you ever felt discomfort, pain, or pressure in your chest during exercise?",
  "Are you a smoker or vape user?",
  "Do you drink alcoholic beverages?",
];

const TREATMENT_NOTICE = "I/We hereby grant permission to the nurse, physician, and dentist of the National University Health Services to render me / my son / my daughter any medical and/or dental treatment that they deem necessary as part of first aid treatment, especially during (but not limited to) emergency cases. I understand that NU Health Services will make all possible effort to inform me in the event of such treatment in an emergency.";
const TRAVEL_NOTICE = "Please declare any past medical advice against travel or health-related issues experienced during travel.";
const DECLARATION_NOTICE = "I/We hereby declare and certify that all information disclosed is true and accurate to the best of my knowledge. I/We understand that I/we may be liable for disqualification for any false declaration or concealment of information. I/We hereby authorize National University Health Services to conduct examinations necessary for assessment. I/We fully understand that the Health Services Office has limited facilities to accommodate and attend to cases; thus, should I / my son / my daughter have a pre-existing condition, I/we shall provide an updated medical clearance and coordinate with the attending physician regarding activity limitations/precautions. Furthermore, I/We hereby give my consent to National University Health Services to release results/examinations to the authorized office if necessary.";

function ascii(value) {
  return String(value ?? "")
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ");
}

function label(value) {
  return ascii(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function wrap(value, limit = 98) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const result = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > limit) {
      result.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result.length ? result : [""];
}

function literal(value) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function valueForConsent(value, consent) {
  if (value === "Yes") return consent;
  return value;
}

function sectionsFor(payload) {
  const section = (title, rows) => ({ title, rows: rows.filter(([, value]) => value !== undefined && value !== null && value !== "") });
  const consent = (key, statement) => ["Consent", valueForConsent(payload[key], statement)];
  const indicators = payload.healthIndicators || {};
  const indicatorRows = HEALTH_INDICATOR_QUESTIONS.map((question, index) => [question, indicators[question] ?? indicators[String(index + 1)] ?? ""]);
  const rows = [
    section("1. Personal Information", [
      ["Student ID Number", payload.studentId], ["Full Name (Last Name, First Name, Middle Initial)", payload.fullName],
      ["Date of Birth", payload.dateOfBirth || (payload.age != null ? `Age ${payload.age} (legacy record)` : "")], ["Sex Assigned at Birth", payload.sexAssignedAtBirth], ["Religion", payload.religion],
      ["Home Address", payload.homeAddress], ["Degree Program / Strand", payload.degreeProgram],
      ["Student Mobile Number", payload.studentMobileNumber], ["Entry Status", payload.entryStatus],
      ["Academic Year", payload.academicYear], ["Term", payload.term], ["Parent / Guardian's Name", payload.parentGuardianName],
      ["Parent / Guardian's Contact Number", payload.parentGuardianContactNumber],
    ]),
    section("2. Disability Declaration (PWD)", [
      ["Are you a Person with Disability (PWD)?", payload.hasDisability], ["Specified Disability", payload.specifiedDisability],
      ["Supporting documents", payload.hasDisability === "Yes" ? "Provide a medical certificate and a copy of the PWD card to the Health Services Office." : "Not applicable"],
    ]),
    section("3. Medical History - Pre-Existing and Historical Conditions", [
      ["Selected conditions", Array.isArray(payload.medicalConditions) ? (payload.medicalConditions.join(", ") || "None selected") : payload.medicalConditions],
    ]),
    section("3. Medical History - Health Screen Indicators", indicatorRows),
    section("4. Consent to Treatment Waiver", [
      ["Statement", TREATMENT_NOTICE], consent("treatmentConsent", "I have read and understood the statement above and hereby give my consent."),
      ["Electronic Signature", payload.treatmentSignature],
    ]),
    section("5. Travel Health Declaration Waiver", [
      ["Statement", TRAVEL_NOTICE],
      ["Have you ever been advised not to travel by a doctor due to sickness or disability, or had an untoward health-related experience during travel?", payload.travelRestrictionsOrIssues],
    ]),
    section("6. Health Status Declaration Waiver", [
      ["Statement", DECLARATION_NOTICE], consent("finalDeclarationConsent", "I have read, fully understood, and certify that all information provided is true and accurate. I also give my consent as stated above."),
      ["Electronic Signature", payload.finalDeclarationSignature],
    ]),
  ];

  const knownKeys = new Set([
    "studentId", "fullName", "age", "sexAssignedAtBirth", "religion", "homeAddress", "degreeProgram", "studentMobileNumber", "entryStatus", "academicYear", "term", "parentGuardianName", "parentGuardianContactNumber", "hasDisability", "specifiedDisability", "medicalConditions", "healthIndicators", "treatmentConsent", "treatmentSignature", "travelRestrictionsOrIssues", "finalDeclarationConsent", "finalDeclarationSignature", "submittedAt", "dateOfBirth", "sex", "institutionalAffiliation",
  ]);
  const otherRows = Object.entries(payload || {}).filter(([key, value]) => !knownKeys.has(key) && value !== undefined && value !== null && value !== "");
  if (otherRows.length) rows.push(section("Additional Submitted Information", otherRows.map(([key, value]) => [label(key), Array.isArray(value) ? value.join(", ") : value])));
  return rows.filter(({ rows: sectionRows }) => sectionRows.length);
}

/** Create a professional, printable, multi-page PDF from a kiosk health declaration. */
export function healthDeclarationToPdf(payload = {}) {
  const pages = [];
  let commands = [];
  let y = 0;
  let pageNumber = 0;

  const text = (font, size, color, x, baseline, content) => {
    commands.push(`BT /${font} ${size} Tf ${color} rg ${x} ${baseline} Td (${literal(content)}) Tj ET`);
  };
  const beginPage = () => {
    pageNumber++;
    commands = ["q 0.055 0.20 0.43 rg 0 752 595 90 re f Q", "q 0.95 0.74 0.24 rg 0 744 595 8 re f Q"];
    text("F2", 18, "1 1 1", 42, 803, "Health Status Declaration");
    text("F1", 9, "0.88 0.93 1", 42, 783, "NU Fairview Health Services Office | Student Health Record");
    if (pageNumber === 1) {
      const student = payload.fullName ? `Student: ${payload.fullName}` : "Student Health Declaration";
      const id = payload.studentId ? `   |   ID: ${payload.studentId}` : "";
      text("F1", 9, "1 1 1", 42, 764, `${student}${id}`);
      y = 724;
    } else y = 724;
  };
  const finishPage = () => pages.push(commands);
  const sectionTitle = (title) => {
    commands.push(`q 0.91 0.95 0.99 rg 42 ${y - 5} 511 24 re f Q`);
    commands.push(`q 0.10 0.34 0.64 rg 42 ${y - 5} 4 24 re f Q`);
    text("F2", 10, "0.08 0.22 0.42", 53, y + 2, title);
    y -= 35;
  };
  const drawFooter = (pageCommands, index) => {
    pageCommands.push("q 0.82 0.86 0.91 RG 42 42 m 553 42 l S Q");
    pageCommands.push(`BT /F1 8 Tf 0.38 0.43 0.51 rg 42 27 Td (Health Services Office | Confidential) Tj ET`);
    pageCommands.push(`BT /F1 8 Tf 0.38 0.43 0.51 rg 510 27 Td (Page ${index + 1} of ${pages.length}) Tj ET`);
  };

  beginPage();
  for (const section of sectionsFor(payload)) {
    if (y < 100) {
      finishPage();
      beginPage();
    }
    sectionTitle(section.title);
    for (const [question, answerValue] of section.rows) {
      const answer = Array.isArray(answerValue) ? answerValue.join(", ") : String(answerValue);
      const questionLines = wrap(question, 98);
      const answerLines = wrap(`Response: ${answer}`, 98);
      const blockHeight = questionLines.length * 12 + answerLines.length * 12 + 12;
      if (y - blockHeight < 58) {
        finishPage();
        beginPage();
        sectionTitle(`${section.title} (continued)`);
      }
      for (const line of questionLines) {
        text("F2", 8.5, "0.10 0.24 0.40", 52, y, line);
        y -= 12;
      }
      for (const line of answerLines) {
        text("F1", 9, "0.16 0.20 0.26", 62, y, line);
        y -= 12;
      }
      commands.push(`q 0.88 0.90 0.93 RG 52 ${y + 3} m 553 ${y + 3} l S Q`);
      y -= 10;
    }
    y -= 5;
  }
  finishPage();
  pages.forEach(drawFooter);

  const objects = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((pageCommands, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const stream = pageCommands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
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
