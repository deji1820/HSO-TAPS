/** Classifies blood pressure using the kiosk's AHA / JNC 2017 categories. */
export function classifyBP(systolic, diastolic) {
  const s = Number(systolic);
  const d = Number(diastolic);
  if (!s || !d || Number.isNaN(s) || Number.isNaN(d)) return null;
  if (s < 90 || d < 60) return "Low (Hypotension)";
  if (s < 120 && d < 80) return "Normal";
  if (s < 130 && d < 80) return "Elevated";
  if (s < 140 || d < 90) return "Stage 1 Hypertension";
  if (s < 180 || d < 120) return "Stage 2 Hypertension";
  return "Hypertensive Crisis";
}
