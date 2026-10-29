import assert from "node:assert/strict";
import { readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { generateCases } from "./quint-033-cases.mjs";

const root = resolve(import.meta.dirname, "..");
const cli = realpathSync(process.env.QUINT_CLI ?? join(root,
  "test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js"));
assert.equal(JSON.parse(readFileSync(join(dirname(cli), "../../package.json"), "utf8")).version, "0.33.0");
const require = createRequire(cli);
const { CharStreams, CommonTokenStream } = require("antlr4ts");
const generated = require(join(dirname(cli), "generated/QuintParser.js"));
const { QuintParser } = generated;
const { QuintLexer } = require(join(dirname(cli), "generated/QuintLexer.js"));

const classes = Object.entries(generated)
  .filter(([name, value]) => name.endsWith("Context") && typeof value === "function");
const parents = new Set(classes.map(([, value]) => Object.getPrototypeOf(value.prototype)?.constructor.name));
const alternatives = classes.map(([name]) => name).filter(name => !parents.has(name));
// These rules are REPL-only entry points, unreachable from modules().
const excluded = new Set(["DeclarationOrExprContext", "OperatorContext", "LiteralContext"]);
const required = alternatives.filter(name => !excluded.has(name));
// These alternatives intentionally notify ANTLR error listeners.
const diagnosticAlternatives = new Set([
  "ErrorEqContext", "ReservedContext", "WrongTypeAppContext", "WrongTypeApplicationContext",
]);
const contexts = new Map();
const tokens = new Map();
const sources = generateCases();

function addFiles(path) {
  if (!statSync(path).isDirectory()) {
    sources.push({ name: path, source: readFileSync(path, "utf8") });
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
    if (entry.isDirectory() || entry.name.endsWith(".qnt")) addFiles(join(path, entry.name));
  }
}
const inputs = process.argv.slice(2).filter(arg => arg !== "--quiet");
for (const path of inputs.length ? inputs : [join(root, "test/fixtures")]) addFiles(resolve(path));

for (const { name, source } of sources) {
  const errors = [];
  const listener = { syntaxError: (_recognizer, _symbol, _line, _column, message) => errors.push(message) };
  const lexer = new QuintLexer(CharStreams.fromString(source));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const stream = new CommonTokenStream(lexer);
  const parser = new QuintParser(stream);
  parser.removeErrorListeners();
  parser.addErrorListener(listener);
  const tree = parser.modules();
  stream.fill();
  const witness = { file: name, parserDiagnostics: errors };
  for (const token of stream.getTokens()) {
    if (!tokens.has(token.type) || !errors.length) tokens.set(token.type, witness);
  }
  function visit(node) {
    if (node.ruleIndex === undefined) return;
    const kind = node.constructor.name;
    const previous = contexts.get(kind);
    if (!previous || (previous.parserDiagnostics.length && !errors.length)) contexts.set(kind, witness);
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
}

const missing = required.filter(name => !contexts.has(name));
const missingValidWitnesses = required.filter(name => !diagnosticAlternatives.has(name)
  && contexts.has(name) && contexts.get(name).parserDiagnostics.length);
const skippedTokens = new Set(["WS", "COMMENT", "LINE_COMMENT"]);
const requiredTokens = [];
for (let type = 1; type <= QuintLexer.WS; type++) {
  if (!skippedTokens.has(QuintLexer.VOCABULARY.getSymbolicName(type))) requiredTokens.push(type);
}
const missingTokens = requiredTokens.filter(type => !tokens.has(type))
  .map(type => QuintLexer.VOCABULARY.getDisplayName(type));
const report = {
  sources: sources.length,
  alternatives: required.length,
  covered: required.length - missing.length,
  tokens: requiredTokens.length,
  missing, missingValidWitnesses, missingTokens,
  excluded: [...excluded],
  tokenWitnesses: Object.fromEntries(requiredTokens.filter(type => tokens.has(type))
    .map(type => [QuintLexer.VOCABULARY.getDisplayName(type), tokens.get(type)])),
  witnesses: Object.fromEntries(required.filter(name => contexts.has(name)).map(name => [name, contexts.get(name)])),
};
if (process.env.QUINT_COVERAGE_REPORT) writeFileSync(process.env.QUINT_COVERAGE_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log(`ANTLR coverage: ${report.covered}/${report.alternatives} file-grammar alternatives; `
  + `${report.tokens - missingTokens.length}/${report.tokens} emitted token classes; ${report.sources} sources`);
if (missing.length) console.error(`Missing alternatives: ${missing.join(", ")}`);
if (missingValidWitnesses.length) console.error(`Only recovered/error witnesses: ${missingValidWitnesses.join(", ")}`);
if (missingTokens.length) console.error(`Missing token classes: ${missingTokens.join(", ")}`);
if (missing.length || missingValidWitnesses.length || missingTokens.length) process.exitCode = 1;
