import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const fixture = path.join(root, "test/fixtures/lexical-nul-characters.qnt");
const binding = path.join(root, "build/Release/tree_sitter_quint_binding.node");
function worker(mode, exposeGc = true) {
  return spawnSync(process.execPath, [...(exposeGc ? ["--expose-gc"] : []),
    "scripts/benchmark-parser.mjs", "--worker", "--binding", binding,
    "--source-file", fixture, "--extended-edits",
    ...(mode ? ["--memory-diagnostics", mode] : [])],
  { cwd: root, encoding: "utf8", timeout: 10000 });
}

test("memory diagnostics retain full tree checks and label omitted captures", () => {
  const ordinary = worker();
  assert.equal(ordinary.status, 0, ordinary.stderr);
  const expected = JSON.parse(ordinary.stdout);
  assert.equal(expected.treeValidation, "full");
  assert.equal(expected.diagnosticOnly, false);
  assert.equal(expected.scheduling, "yield-between-parses");
  assert(expected.eventLoopYields > 0);
  assert(expected.outputs.every(row => /^[a-f0-9]{64}$/.test(row[2])));
  assert.equal(expected.memoryDiagnostics, undefined);
  for (const mode of ["full", "yield", "gc", "no-capture"]) {
    const result = worker(mode);
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(result.stdout);
    assert.equal(actual.diagnosticOnly, true);
    assert.equal(actual.memoryDiagnostics.mode, mode);
    assert(actual.memoryDiagnostics.snapshots.some(s => s.phase === "initial-parse"));
    assert(actual.memoryDiagnostics.snapshots.every(s => s.rss > 0 && s.heapUsed > 0));
    if (mode === "no-capture") {
      assert.equal(actual.treeValidation, "omitted");
      assert(actual.outputs.every(row => row[2] === null));
      assert.deepEqual(actual.outputs.map(row => row.slice(0, 2)), expected.outputs.map(row => row.slice(0, 2)));
    } else {
      assert.equal(actual.treeValidation, "full");
      assert.deepEqual(actual.outputs, expected.outputs);
    }
    if (mode === "full") assert.equal(actual.eventLoopYields, 0);
    if (mode === "gc") assert(actual.memoryDiagnostics.forcedGc > 0);
  }
  const missingGc = worker("gc", false);
  assert.notEqual(missingGc.status, 0);
  assert.match(missingGc.stderr, /expose-gc/);
});

test("memory profile reports preserve provenance and separate diagnostic modes", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "quint-memory-test-"));
  try {
    const output = path.join(temporary, "report.json");
    const result = spawnSync(process.execPath, ["scripts/profile-parser-memory.mjs",
      "--binding", binding, "--source", fixture, "--rounds", "1", "--output", output],
    { cwd: root, encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.diagnosticOnly, true);
    assert.equal(report.measurements.length, 4);
    assert.match(report.workerSha256, /^[a-f0-9]{64}$/);
    assert.match(report.binding.sha256, /^[a-f0-9]{64}$/);
    assert.match(report.source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.measurements.find(r => r.mode === "no-capture").treeValidation, "omitted");
    assert.equal(report.summary.length, 4);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
