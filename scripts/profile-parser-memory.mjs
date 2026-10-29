import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Diagnostic intervention, not an ordinary latency or isolated-memory benchmark.
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const source = option("--source"), output = option("--output");
const rounds = Number(option("--rounds", "3"));
const modes = option("--modes", "full,no-capture,yield,gc").split(",");
assert(source && output && Number.isInteger(rounds) && rounds > 0,
  "usage: node scripts/profile-parser-memory.mjs --source FILE --output FILE [--binding FILE] [--rounds N] [--modes full,no-capture,yield,gc]");
assert(modes.length && new Set(modes).size === modes.length &&
  modes.every(mode => ["full", "no-capture", "yield", "gc"].includes(mode)), "Invalid diagnostic modes");
assert(!existsSync(output), `Output already exists: ${output}`);
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const binding = path.resolve(option("--binding", "build/Release/tree_sitter_quint_binding.node"));
const sourceFile = path.resolve(source);
const worker = fileURLToPath(new URL("./benchmark-parser.mjs", import.meta.url));
const report = { schema: 1, workerSha256: digest(worker), diagnosticOnly: true, node: process.version,
  platform: `${process.platform}/${process.arch}`, cpu: os.cpus()[0]?.model,
  binding: { path: binding, sha256: digest(binding) },
  source: { path: sourceFile, sha256: digest(sourceFile) }, rounds, modes, measurements: [], summary: [] };
let expectedFull, expectedStatuses;
try {
  for (let round = 0; round < rounds; round++) {
    for (const mode of round % 2 ? [...modes].reverse() : modes) {
      const run = spawnSync(process.execPath, ["--expose-gc", worker, "--worker", "--binding", binding,
        "--source-file", sourceFile, "--extended-edits", "--memory-diagnostics", mode],
      { encoding: "utf8", timeout: 120000 });
      if (run.status !== 0 || run.stderr) report.failure = { mode, round, status: run.status,
        signal: run.signal, error: run.error?.message, stdout: run.stdout, stderr: run.stderr };
      assert.equal(run.status, 0, run.stderr || run.error?.message);
      assert.equal(run.stderr, "");
      const result = JSON.parse(run.stdout);
      assert.equal(result.diagnosticOnly, true);
      const statuses = result.outputs.map(row => row.slice(0, 2));
      expectedStatuses ??= statuses;
      assert.deepEqual(statuses, expectedStatuses, "Diagnostic mode changed syntax status");
      if (result.treeValidation === "full") {
        expectedFull ??= result.outputs;
        assert.deepEqual(result.outputs, expectedFull, "Diagnostic mode changed full trees");
      } else {
        assert.equal(mode, "no-capture");
        assert.equal(result.treeValidation, "omitted");
      }
      report.measurements.push({ mode, round, ...result });
      assert.equal(digest(binding), report.binding.sha256, "Binding changed during profiling");
      assert.equal(digest(sourceFile), report.source.sha256, "Input changed during profiling");
      assert.equal(digest(worker), report.workerSha256, "Worker changed during profiling");
      console.error(`profiled ${mode}, round ${round + 1}/${rounds}`);
    }
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.summary = modes.map(mode => {
    const runs = report.measurements.filter(row => row.mode === mode);
    return { mode, peakRssMiB: median(runs.map(row => row.maxRssKiB / 1024)),
      sampledHeapPeakMiB: median(runs.map(row => Math.max(...row.memoryDiagnostics.snapshots.map(s => s.heapUsed)) / 1048576)),
      treeValidation: runs[0].treeValidation };
  });
} catch (error) {
  report.error = error.stack;
  throw error;
} finally {
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
}
console.log(JSON.stringify(report.summary, null, 2));
