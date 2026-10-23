export const HYPOTHERMIA_BELOW_C = 35.5;
export const FEVER_AT_OR_ABOVE_C = 37.8;

export function classifyTemperature(value) {
  const temperature = Number(value);
  if (value == null || value === "" || !Number.isFinite(temperature)) return null;
  if (temperature < HYPOTHERMIA_BELOW_C) return "Hypothermia";
  if (temperature >= FEVER_AT_OR_ABOVE_C) return "Fever";
  return "Normal";
}
