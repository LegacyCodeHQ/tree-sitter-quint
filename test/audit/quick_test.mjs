import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCases } from "../../scripts/quint-033-cases.mjs";
import { generateDeepCases } from "../../scripts/quint-033-deep-cases.mjs";
import { generateLocalBodyCases } from "../../scripts/quint-033-body-cases.mjs";
import { generateQuickCases } from "../../scripts/quint-033-quick-cases.mjs";

test("quick audit retains every boundary family within a small case budget", () => {
  const cases = generateQuickCases();
  assert(cases.length > 100 && cases.length <= 512);
  const families = new Set(cases.map(entry => entry.family));
  for (const entry of generateCases()) assert(families.has(entry.family), entry.family);
  assert(families.has("deep-expression"));
  assert(families.has("local-body-operator-pair"));
});

test("quick audit uses unchanged sources from the exhaustive matrices", () => {
  const full = new Map([...generateCases(), ...generateDeepCases(), ...generateLocalBodyCases()]
    .map(entry => [entry.name, entry]));
  const cases = generateQuickCases();
  assert.equal(new Set(cases.map(entry => entry.name)).size, cases.length);
  for (const entry of cases) assert.deepEqual(entry, full.get(entry.name), entry.name);
});

test("quick audit selection is deterministic", () => {
  assert.deepEqual(generateQuickCases(), generateQuickCases());
});
