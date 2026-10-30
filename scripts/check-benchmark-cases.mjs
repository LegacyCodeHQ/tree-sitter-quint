import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { benchmarkInputs } from "./parser-benchmark-cases.mjs";
import { editorSources, editorTurns } from "./editor-benchmark-cases.mjs";

const cli = realpathSync(process.env.QUINT_CLI ?? new URL(
  "../test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js", import.meta.url));
const require = createRequire(cli);
assert.equal(JSON.parse(readFileSync(path.join(path.dirname(cli), "../../package.json"))).version, "0.33.0");
const { CharStreams, CommonTokenStream } = require("antlr4ts");
const { QuintLexer } = require(path.join(path.dirname(cli), "generated/QuintLexer.js"));
const { QuintParser } = require(path.join(path.dirname(cli), "generated/QuintParser.js"));
const inputs = benchmarkInputs(true);
const fingerprint = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
assert.equal(inputs.length, 14);
assert.equal(benchmarkInputs().length, 4);
assert.equal(fingerprint, "f813c7a76bca6500624ea9bc86a2cdbc9bf3a870d603016793697ad7df810411",
  "Benchmark matrix changed: review workloads and update the fingerprint deliberately");
assert.equal(new Set(inputs.map(input => input.name)).size, inputs.length);
const editorInputs = [...new Map(editorTurns(editorSources(2, 3)).map(turn => [turn.source,
  {name: `editor-${turn.document}-${turn.label}`, source: turn.source, referenceAccepted: turn.label !== 'brace'}])).values()];
for (const input of [...inputs, ...editorInputs]) {
  const errors = [];
  const listener = { syntaxError: () => errors.push(true) };
  const lexer = new QuintLexer(CharStreams.fromString(input.source));
  lexer.removeErrorListeners(); lexer.addErrorListener(listener);
  const parser = new QuintParser(new CommonTokenStream(lexer));
  parser.removeErrorListeners(); parser.addErrorListener(listener);
  parser.modules();
  assert.equal(errors.length === 0, input.referenceAccepted, input.name);
}
console.log(`${inputs.length} benchmark inputs agree with Quint 0.33.0; sha256 ${fingerprint}`);
console.log(`${editorInputs.length} distinct editor inputs agree with Quint 0.33.0`);
