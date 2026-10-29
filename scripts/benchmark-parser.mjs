import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import Parser from "tree-sitter";
import { benchmarkInputs } from "./parser-benchmark-cases.mjs";

// Run ordinary native bindings in fresh, alternating processes. Tree capture is
// outside the timed regions; RSS includes startup and capture allocations.
const args = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
}
const hash = text => createHash("sha256").update(text).digest("hex");
function capture(tree) {
  const rows = [];
  const pending = [[tree.rootNode, null]];
  while (pending.length) {
    const [node, field] = pending.pop();
    rows.push([node.type, field, node.isNamed, node.isMissing, node.hasError,
      node.startIndex, node.endIndex, node.startPosition, node.endPosition, node.childCount]);
    for (let i = node.childCount - 1; i >= 0; i--) {
      pending.push([node.child(i), node.fieldNameForChild(i)]);
    }
  }
  return hash(JSON.stringify(rows));
}
if (args.includes("--worker")) {
  const binding = createRequire(import.meta.url)(path.resolve(option("--binding")));
  const source = readFileSync(option("--source-file", 0), "utf8");
  const parser = new Parser();
  parser.setLanguage(binding);
  const outputs = [];
  const initialStart = performance.now();
  let tree = parser.parse(source);
  const initialMs = performance.now() - initialStart;
  outputs.push(["initial", tree.rootNode.hasError, capture(tree)]);
  // A prefix comment, a module rename, and an incomplete final brace exercise
  // shifts, unchanged suffixes, and valid/recovery transitions in both directions.
  const name = /module\s+([A-Za-z_][A-Za-z_0-9]*)/.exec(source);
  const variants = ["/* edit: \u03bb */\n" + source,
    name ? source.replace(name[0], name[0] + "Edited") : source + "\n",
    source.replace(/}([^}]*)$/, "$1")];
  const editNames = ["prefix-comment", "module-name", "closing-brace"];
  if (args.includes("--extended-edits")) {
    variants.push(source.replace(/\b[0-9]+\b/, number => String(Number(number) + 1)),
      source.replace(/\+\s*1\b/, "- 1"));
    editNames.push("literal", "operator");
  }
  let current = source;
  const editsMs = [];
  const point = (s, i) => {
    const lines = s.slice(0, i).split("\n");
    return { row: lines.length - 1, column: lines.at(-1).length };
  };
  for (const [index, changed] of variants.entries()) {
    if (changed === source) continue;
    for (const next of [changed, source]) {
      let start = 0, oldEnd = current.length, newEnd = next.length;
      while (start < oldEnd && start < newEnd && current[start] === next[start]) start++;
      while (oldEnd > start && newEnd > start && current[oldEnd - 1] === next[newEnd - 1]) {
        oldEnd--; newEnd--;
      }
      tree.edit({ startIndex: start, oldEndIndex: oldEnd, newEndIndex: newEnd,
        startPosition: point(current, start), oldEndPosition: point(current, oldEnd),
        newEndPosition: point(next, newEnd) });
      const begin = performance.now();
      tree = parser.parse(next, tree);
      editsMs.push(performance.now() - begin);
      const digest = capture(tree);
      const freshParser = new Parser();
      freshParser.setLanguage(binding);
      const fresh = freshParser.parse(next);
      assert.equal(digest, capture(fresh), "incremental tree differs from fresh parse");
      outputs.push([`${editNames[index]}${next === source ? ":undo" : ""}`, tree.rootNode.hasError, digest]);
      current = next;
    }
  }
  const usage = process.resourceUsage();
  console.log(JSON.stringify({ initialMs, editsMs, outputs,
    maxRssKiB: usage.maxRSS,
    processCpuMicros: { user: usage.userCPUTime, system: usage.systemCPUTime } }));
} else {
  const baseline = option("--baseline-binding");
  const candidate = option("--candidate-binding", "build/Release/tree_sitter_quint_binding.node");
  const output = option("--output");
  const rounds = Number(option("--rounds", "5"));
  if (!baseline || !output || !Number.isInteger(rounds) || rounds < 1) {
    throw new Error("usage: node scripts/benchmark-parser.mjs --baseline-binding FILE --output FILE [--candidate-binding FILE] [--rounds 5] [--examples DIR] [--corpus DIR] [--scale] [--stress] [--match REGEX]");
  }
  assert(!existsSync(output), `Output already exists: ${output}`);
  const stress = args.includes("--stress");
  const scaling = args.includes("--scale") || stress;
  let inputs = benchmarkInputs(scaling).filter(input => !input.stress || stress);
  function filesBelow(directory) {
    const files = [];
    function visit(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory() && ![".git", "node_modules", "dist"].includes(entry.name)) visit(file);
        else if (entry.name.endsWith(".qnt")) files.push(file);
      }
    }
    visit(directory);
    return files;
  }
  const examples = option("--examples");
  if (examples) {
    const files = filesBelow(examples);
    files.sort((a, b) => statSync(b).size - statSync(a).size || a.localeCompare(b));
    for (const file of files.slice(0, 3)) {
      inputs.push({ name: path.relative(examples, file), source: readFileSync(file, "utf8") });
    }
  }
  const corpus = option("--corpus");
  if (corpus) {
    for (const file of filesBelow(corpus).sort()) {
      inputs.push({ name: `corpus/${path.relative(corpus, file)}`, source: readFileSync(file, "utf8") });
    }
  }
  if (option("--match")) inputs = inputs.filter(input => new RegExp(option("--match")).test(input.name));
  assert(inputs.length > 0, "No benchmark inputs selected");
  const report = { schema: 2, inputDelivery: "file", scaling, stress, node: process.version, platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model, bindings: {}, rounds, inputs: [], measurements: [] };
  for (const [version, file] of Object.entries({ baseline, candidate })) {
    report.bindings[version] = { path: path.resolve(file), sha256: hash(readFileSync(file)) };
  }
  // Materialize inputs before worker startup instead of synchronously piping
  // large payloads. Input I/O remains outside every timed region.
  const temporary = mkdtempSync(path.join(os.tmpdir(), "quint-benchmark-"));
  const sourceFile = path.join(temporary, "input.qnt");
  try {
    for (const input of inputs) {
      writeFileSync(sourceFile, input.source);
      report.inputs.push({ name: input.name, bytes: Buffer.byteLength(input.source), sha256: hash(input.source) });
      let expected;
      for (let round = 0; round < rounds; round++) {
        for (const version of round % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
          const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker",
            "--binding", report.bindings[version].path, "--source-file", sourceFile, ...(scaling ? ["--extended-edits"] : [])],
          { encoding: "utf8", timeout: 120000 });
          if (run.status !== 0) report.failure = { name: input.name, version, round, status: run.status,
            signal: run.signal, error: run.error?.message, stdout: run.stdout, stderr: run.stderr };
          assert.equal(run.status, 0, `${input.name} ${version}: ${run.stderr}`);
          assert.equal(run.stderr, "");
          const result = JSON.parse(run.stdout);
          report.measurements.push({ name: input.name, round, version, ...result });
          if (input.referenceAccepted !== undefined) {
            assert.equal(result.outputs[0][1], !input.referenceAccepted, `${input.name}: unexpected initial syntax status`);
          }
          expected ??= result.outputs;
          assert.deepEqual(result.outputs, expected, `${input.name}: baseline/candidate output mismatch`);
          assert.equal(hash(readFileSync(report.bindings[version].path)), report.bindings[version].sha256,
            "Native binding changed during the benchmark");
        }
      }
      console.error(`matched ${input.name}`);
    }
  } catch (error) {
    report.error = error.stack;
    throw error;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    // Every raw measurement and output digest is retained; no timing threshold is
    // used as a correctness test on shared development/CI hosts.
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  for (const { name } of inputs) {
    const summary = {};
    for (const version of ["baseline", "candidate"]) {
      const runs = report.measurements.filter(r => r.name === name && r.version === version);
      summary[version] = { initialMs: median(runs.map(r => r.initialMs)),
        editSequenceMs: median(runs.map(r => r.editsMs.reduce((a, b) => a + b, 0))),
        editCount: runs[0].editsMs.length,
        maxRssKiB: median(runs.map(r => r.maxRssKiB)) };
    }
    console.log(JSON.stringify({ name, ...summary }));
  }
}
