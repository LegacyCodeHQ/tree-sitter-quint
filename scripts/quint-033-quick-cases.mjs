import { generateCases } from "./quint-033-cases.mjs";
import { generateDeepCases } from "./quint-033-deep-cases.mjs";
import { generateLocalBodyCases } from "./quint-033-body-cases.mjs";

// Keep endpoints and evenly spaced interior cases from every boundary family.
// This is a representative PR check; it does not replace exhaustive coverage.
function sample(cases, limit) {
  const count = Math.min(limit, cases.length);
  if (count < 2) return cases.slice(0, count);
  return Array.from({ length: count }, (_, i) => cases[Math.round(i * (cases.length - 1) / (count - 1))]);
}

export function generateQuickCases() {
  const families = new Map();
  for (const entry of generateCases()) {
    if (!families.has(entry.family)) families.set(entry.family, []);
    families.get(entry.family).push(entry);
  }
  return [
    ...[...families.values()].flatMap(cases => sample(cases, 8)),
    ...generateDeepCases([[0x3311001, 64]]),
    ...sample(generateLocalBodyCases(), 36),
  ];
}
