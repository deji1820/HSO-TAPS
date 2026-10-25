import Counter from "../models/Counter.js";

/**
 * Generates PDF-mockup-style queue numbers like "R0003", "M0001" — a
 * single letter prefix by service type, plus a 4-digit sequence that
 * resets daily.
 *
 * ASSUMPTION (flag for review against the actual mockup): the PDF only
 * showed two example numbers ("R0003", "M0001"), so only two of the six
 * QueueEntry.serviceType values have a confirmed prefix. The rest below
 * are reasonable guesses — check these against the real mockup and adjust
 * SERVICE_PREFIXES if they're wrong; nothing else needs to change to fix it.
 *
 *   "Medical Consultation"   -> "M"  (confirmed by mockup example M0001)
 *   "Quick Health Screening" -> "R"  (guessed: "Referral" — this prefix is
 *                                     only ever used when the fever-override
 *                                     rule escalates a self-service screening
 *                                     into the queue, which reads like a
 *                                     referral into the clinic rather than
 *                                     a scheduled service — fits R0003)
 *   "Dental Consultation"    -> "D"  (guessed)
 *   "Medical Clearance"      -> "C"  (guessed)
 *   "Prescription/OTC Pickup"-> "P"  (guessed)
 *   "General Inquiry"        -> "G"  (guessed)
 */
const SERVICE_PREFIXES = {
  "Quick Health Screening": "R",
  "Medical Consultation": "M",
  "Dental Consultation": "D",
  "Medical Clearance": "C",
  "Prescription/OTC Pickup": "P",
  "General Inquiry": "G",
};

function todayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Returns the next queue number for a given serviceType, e.g. "M0001".
 * Safe under concurrent calls — see Counter.js for why.
 */
export async function nextQueueNumber(serviceType, { session } = {}) {
  let prefix = SERVICE_PREFIXES[serviceType];
  if (!prefix) {
    console.warn(
      `[queueNumbering] No prefix mapped for serviceType "${serviceType}" — using "X". ` +
        `Add it to SERVICE_PREFIXES in queueNumbering.service.js.`
    );
    prefix = "X";
  }

  const key = `${prefix}-${todayKey()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, ...(session ? { session } : {}) }
  );

  return `${prefix}${String(counter.seq).padStart(4, "0")}`;
}
