import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Parser from "tree-sitter";
import { generateLocalHeaderCases } from "./quint-033-header-cases.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const bindingPath = path.resolve(option("--binding") ?? path.join(root,
  "build/Release/tree_sitter_quint_binding.node"));
const require = createRequire(import.meta.url);
const binding = require(bindingPath);
const baselinePath = option("--baseline-binding");
const baseline = baselinePath ? require(path.resolve(baselinePath)) : undefined;
const baselineSha256 = baselinePath ? createHash("sha256").update(readFileSync(baselinePath)).digest("hex") : undefined;
const validOnly = args.includes("--valid-only");
const cli = realpathSync(process.env.QUINT_CLI ?? path.join(root,
  "test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js"));
const reference = createRequire(cli);
assert.equal(JSON.parse(readFileSync(path.join(path.dirname(cli), "../../package.json"))).version, "0.33.0");
const { CharStreams, CommonTokenStream } = reference("antlr4ts");
const { QuintLexer } = reference(path.join(path.dirname(cli), "generated/QuintLexer.js"));
const { QuintParser } = reference(path.join(path.dirname(cli), "generated/QuintParser.js"));
const hash = data => createHash("sha256").update(data).digest("hex");
const cases = generateLocalHeaderCases();
assert.equal(cases.length, 80);
const fingerprint = hash(JSON.stringify(cases));
assert.equal(fingerprint, "ab94766513c2142671562eb0158292991e856a1de9a27bb42cbedb7e5e8a526a",
  "Local-header matrix changed: review the exact sources before updating its fingerprint");
const snapshot = node => [node.type, node.isNamed, node.isMissing, node.hasError,
  node.startIndex, node.endIndex, node.startPosition, node.endPosition,
  node.children.map((child, i) => [node.fieldNameForChild(i), snapshot(child)])];
const digest = tree => hash(JSON.stringify(snapshot(tree.rootNode)));
const newParser = language => { const parser = new Parser(); parser.setLanguage(language); return parser; };
const point = (source, at) => {
  const lines = source.slice(0, at).split("\n");
  return { row: lines.length - 1, column: lines.at(-1).length };
};
function edit(tree, before, after) {
  let start = 0, oldEnd = before.length, newEnd = after.length;
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  tree.edit({ startIndex: start, oldEndIndex: oldEnd, newEndIndex: newEnd,
    startPosition: point(before, start), oldEndPosition: point(before, oldEnd), newEndPosition: point(after, newEnd) });
}
function oracle(entry) {
  const errors = [];
  const lexer = new QuintLexer(CharStreams.fromString(entry.source));
  lexer.removeErrorListeners(); lexer.addErrorListener({ syntaxError: (...details) => errors.push(details[4]) });
  const input = new CommonTokenStream(lexer);
  input.fill();
  const parser = new QuintParser(input);
  parser.removeErrorListeners(); parser.addErrorListener({ syntaxError: (...details) => errors.push(details[4]) });
  const active = [], events = [];
  const look = input.LT.bind(input);
  input.LT = k => {
    const token = look(k);
    for (const event of active) event.maxToken = Math.max(event.maxToken, token.tokenIndex);
    return token;
  };
  const predict = parser.interpreter.adaptivePredict.bind(parser.interpreter);
  parser.interpreter.adaptivePredict = (stream, decision, context, ...options) => {
    const event = { decision, start: stream.index, maxToken: stream.index,
      pending: context?.ruleIndex === QuintParser.RULE_operDef && context.normalCallName?.()?.text === "pending" };
    active.push(event);
    try {
      // Forward the simulator's context-mode argument as well: it can call
      // adaptivePredict recursively when the DFA requires full context.
      event.alternative = predict(stream, decision, context, ...options);
      return event.alternative;
    } finally {
      active.pop();
      if (decision === 13 && event.pending) events.push(event);
    }
  };
  const tree = parser.modules();
  assert.deepEqual(errors, [], entry.name);
  const pending = [tree];
  let header;
  while (pending.length) {
    const node = pending.pop();
    if (node.ruleIndex === QuintParser.RULE_operDef && node.normalCallName?.()?.text === "pending") header = node;
    pending.push(...(node.children ?? []));
  }
  assert(header && events.length, entry.name);
  assert(events.every(event => event.alternative === (entry.extra ? 1 : 2)), entry.name);
  return { end: header.stop.stopIndex + 1,
    lookahead: Math.max(...events.map(event => event.maxToken - event.start)) };
}

const records = [];
const report = { reference: "0.33.0", fingerprint, binding: { path: bindingPath, sha256: hash(readFileSync(bindingPath)) },
  coverage: validOnly ? "valid-only" : "valid-and-recovery",
  baseline: baselinePath ? { path: path.resolve(baselinePath), sha256: baselineSha256 } : null, records };
try {
  for (let i = 0; i < cases.length; i += 2) {
    const pair = cases.slice(i, i + 2);
    const expected = pair.map(oracle);
    assert.equal(expected[1].end - expected[0].end, 3, `${pair[0].name}: header choice did not change`);
    if (pair[0].qualifier === "val" && pair[0].depth >= 2)
      assert(expected[0].lookahead >= 2 * pair[0].depth, `${pair[0].name}: missing context-dependent prediction`);
    const parser = newParser(binding);
    let source = pair[0].source, tree = parser.parse(source);
    const original = digest(tree);
    const sequence = [pair[0], pair[1], pair[0]];
    if (!validOnly) sequence.push({ source: source + "\nmodule Broken {" }, pair[0]);
    for (const entry of sequence) {
      edit(tree, source, entry.source);
      tree = parser.parse(entry.source, tree);
      source = entry.source;
      const fresh = newParser(binding).parse(source);
      const actual = digest(tree);
      assert.equal(actual, digest(fresh), `${pair[0].name}: incremental/fresh mismatch`);
      if (baseline) assert.equal(actual, digest(newParser(baseline).parse(source)),
        `${pair[0].name}: baseline tree changed (${entry.name ?? "recovery"})`);
      if (entry.name) {
        assert.equal(tree.rootNode.hasError, false, entry.name);
        const header = tree.rootNode.descendantsOfType(["value_definition", "operator_definition"])
          .find(node => node.childForFieldName("name")?.text === "pending");
        assert(header, entry.name);
        assert.equal(header.endIndex, expected[entry.extra].end, entry.name);
        if (entry.extra === 0) assert.equal(actual, original, `${entry.name}: undo changed the original tree`);
      } else assert.equal(tree.rootNode.hasError, true, `${pair[0].name}: unfinished module accepted`);
    }
    records.push(...pair.map((entry, j) => ({ name: entry.name, depth: entry.depth, qualifier: entry.qualifier,
      extra: entry.extra, sourceSha256: hash(entry.source), ...expected[j] })));
  }
  report.passed = true;
  assert.equal(hash(readFileSync(bindingPath)), report.binding.sha256, "Binding changed during the check");
  if (baselinePath) assert.equal(hash(readFileSync(baselinePath)), baselineSha256, "Baseline changed during the check");
  console.log(`${cases.length} local-header cases match Quint 0.33.0; ${report.coverage}; sha256 ${fingerprint}`);
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  if (option("--report")) writeFileSync(option("--report"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
}
