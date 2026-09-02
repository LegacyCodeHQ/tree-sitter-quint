import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import Parser from "tree-sitter";

import quint from "../bindings/node/index.js";

const quiet = process.argv.includes("--quiet");
const inputs = process.argv.slice(2).filter(argument => argument !== "--quiet");

if (inputs.length === 0) {
  console.error("usage: node scripts/check-parse-structure-parity.mjs <file-or-directory> [...]");
  process.exit(2);
}

function quintFiles(inputPaths) {
  const files = [];
  function visit(inputPath) {
    if (!statSync(inputPath).isDirectory()) {
      files.push(inputPath);
      return;
    }
    for (const entry of readdirSync(inputPath, { withFileTypes: true })) {
      if (entry.isDirectory() && [".git", "dist", "node_modules"].includes(entry.name)) {
        continue;
      }
      const entryPath = path.join(inputPath, entry.name);
      if (entry.isDirectory() || entry.name.endsWith(".qnt")) {
        visit(entryPath);
      }
    }
  }
  for (const inputPath of inputPaths) {
    visit(inputPath);
  }
  return files.sort();
}

function resolveQuintCli() {
  if (process.env.QUINT_CLI) {
    return realpathSync(process.env.QUINT_CLI);
  }
  try {
    return realpathSync(execFileSync("which", ["quint"], { encoding: "utf8" }).trim());
  } catch {
    throw new Error("Cannot find Quint. Install it or set QUINT_CLI to its executable.");
  }
}

function loadReferenceParser() {
  const cliPath = resolveQuintCli();
  const require = createRequire(cliPath);
  const { CharStreams, CommonTokenStream } = require("antlr4ts");
  const { QuintLexer } = require(path.join(path.dirname(cliPath), "generated", "QuintLexer.js"));
  const { QuintParser } = require(path.join(path.dirname(cliPath), "generated", "QuintParser.js"));
  const { parsePhase1fromText } = require(
    path.join(path.dirname(cliPath), "parsing", "quintParserFrontend.js"),
  );
  const { newIdGenerator } = require(path.join(path.dirname(cliPath), "idGenerator.js"));
  return {
    CharStreams,
    CommonTokenStream,
    QuintLexer,
    QuintParser,
    parsePhase1fromText,
    newIdGenerator,
    cliPath,
  };
}

const expressionKinds = {
  ActionAllContext: "all_expression",
  ActionAnyContext: "any_expression",
  AndContext: "binary_expression",
  AndExprContext: "and_block_expression",
  AsgnContext: "assignment_expression",
  BracesContext: "block_expression",
  IfElseContext: "if_expression",
  IffContext: "binary_expression",
  ImpliesContext: "binary_expression",
  LambdaConsContext: "lambda_expression",
  LeadsToContext: "binary_expression",
  LetInContext: "nested_definition_expression",
  ListAppContext: "index_expression",
  ListContext: "list_literal",
  MatchContext: "match_expression",
  MultDivContext: "binary_expression",
  OperAppContext: "call_expression",
  OrContext: "binary_expression",
  OrExprContext: "or_block_expression",
  PairContext: "binary_expression",
  ParenContext: "parenthesized_expression",
  PlusMinusContext: "binary_expression",
  PowContext: "binary_expression",
  RecordContext: "record_literal",
  RelationsContext: "binary_expression",
  TupleContext: "tuple_literal",
  UminusContext: "unary_expression",
  UnitContext: "unit_literal",
};

const typeKinds = {
  TypeAppContext: "type_application",
  TypeBoolContext: "primitive_type",
  TypeConstContext: "named_type",
  TypeFunContext: "function_type",
  TypeIntContext: "primitive_type",
  TypeListContext: "list_type",
  TypeOperContext: "operator_type",
  TypeParenContext: "parenthesized_type",
  TypeRecContext: "record_type",
  TypeSetContext: "set_type",
  TypeStrContext: "primitive_type",
  TypeTupleContext: "tuple_type",
  TypeUnitContext: "unit_type",
  TypeVarCaseContext: "type_variable",
};

function contextSpan(node) {
  return { start: node.start.startIndex, end: node.stop.stopIndex + 1 };
}

function literalOrIdentifierKind(text) {
  if (text === "true" || text === "false") return "boolean_literal";
  if (text.startsWith("\"")) return "string_literal";
  if (/^(?:0x[0-9a-fA-F]|[0-9])/.test(text)) return "integer_literal";
  if (text.includes("::")) return "namespace_access_expression";
  return "name_reference";
}

function declarationKind(node, source) {
  const contextName = node.constructor.name;
  if (contextName === "ConstContext") return "constant_declaration";
  if (contextName === "VarContext") return "variable_declaration";
  if (contextName === "AssumeContext") return "assumption_declaration";
  if (contextName === "InstanceContext") return "instance_declaration";
  if (contextName === "ImportDefContext") return "import_declaration";
  if (contextName === "ExportDefContext") return "export_declaration";
  if (contextName === "TypeDefsContext") return "type_declaration";
  if (contextName === "OperContext") {
    const text = source.slice(node.start.startIndex, node.stop.stopIndex + 1);
    return /^(?:pure\s+)?val\b/.test(text) ? "value_definition" : "operator_definition";
  }
  return undefined;
}

function antlrSignatures(source, reference) {
  const lexer = new reference.QuintLexer(reference.CharStreams.fromString(source));
  const parser = new reference.QuintParser(new reference.CommonTokenStream(lexer));
  lexer.removeErrorListeners();
  parser.removeErrorListeners();
  const root = parser.modules();
  const signatures = [];

  function add(kind, node, span = contextSpan(node)) {
    signatures.push({ kind, ...span });
  }

  function visit(node) {
    if (node.ruleIndex === undefined) return;
    const ruleName = parser.ruleNames[node.ruleIndex];
    const contextName = node.constructor.name;

    if (ruleName === "module") {
      const moduleToken = node.children?.find(child => child.text === "module")?.symbol;
      add("module_definition", node, {
        start: moduleToken?.startIndex ?? node.start.startIndex,
        end: node.stop.stopIndex + 1,
      });
    } else if (ruleName === "declaration") {
      const kind = declarationKind(node, source);
      if (kind) add(kind, node);
    } else if (ruleName === "expr") {
      let kind = expressionKinds[contextName];
      if (contextName === "DotCallContext") {
        kind = node.LPAREN?.() ? "call_expression" : "field_access_expression";
      } else if (contextName === "LetInContext") {
        const definition = node.operDef?.();
        const definitionText = definition
          ? source.slice(definition.start.startIndex, definition.stop.stopIndex + 1)
          : "";
        if (/^nondet\b/.test(definitionText)) {
          const definitionSpan = contextSpan(definition);
          signatures.push({
            kind: "nondet_let",
            ...contextSpan(node),
            definitionStart: definitionSpan.start,
            definitionEnd: definitionSpan.end,
          });
          kind = undefined;
        }
      } else if (contextName === "LiteralOrIdContext") {
        kind = literalOrIdentifierKind(source.slice(node.start.startIndex, node.stop.stopIndex + 1));
      }
      if (kind) add(kind, node);
    } else if (ruleName === "type") {
      const kind = typeKinds[contextName];
      if (kind) add(kind, node);
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  visit(root);
  return signatures;
}

const treeKinds = new Map([
  ["anonymous_instance_declaration", "instance_declaration"],
  ["instance_declaration", "instance_declaration"],
  ["module_import_declaration", "import_declaration"],
  ["named_import_declaration", "import_declaration"],
  ["wildcard_import_declaration", "import_declaration"],
  ["module_export_declaration", "export_declaration"],
  ["named_export_declaration", "export_declaration"],
  ["wildcard_export_declaration", "export_declaration"],
  ["type_alias_declaration", "type_declaration"],
  ["uninterpreted_type_declaration", "type_declaration"],
]);

for (const kind of new Set([
  "all_expression", "and_block_expression", "any_expression", "assignment_expression", "assumption_declaration",
  "binary_expression", "block_expression", "boolean_literal", "call_expression",
  "constant_declaration", "field_access_expression", "function_type", "if_expression",
  "index_expression", "integer_literal", "lambda_expression", "list_literal", "list_type",
  "match_expression", "module_definition", "name_reference", "named_type",
  "namespace_access_expression", "nested_definition_expression", "nondet_binding", "operator_definition",
  "operator_type", "or_block_expression", "parenthesized_expression", "parenthesized_type",
  "primitive_type", "record_literal", "record_type", "set_type", "string_literal",
  "tuple_literal", "tuple_type", "type_application", "type_variable", "unary_expression",
  "unit_literal", "unit_type", "value_definition", "variable_declaration",
])) {
  treeKinds.set(kind, kind);
}

function treeSignatures(source, treeParser) {
  const tree = treeParser.parse(source);
  const signatures = new Set();
  function visit(node) {
    const kind = treeKinds.get(node.type);
    if (kind) {
      signatures.add(`${kind}:${node.startIndex}:${node.endIndex}`);
    }
    for (const child of node.namedChildren) visit(child);
  }
  visit(tree.rootNode);
  return signatures;
}

function referenceAccepts(source, filePath, reference) {
  const previousDebug = console.debug;
  console.debug = () => {};
  try {
    return reference.parsePhase1fromText(
      reference.newIdGenerator(), source, filePath,
    ).errors.length === 0;
  } finally {
    console.debug = previousDebug;
  }
}

const reference = loadReferenceParser();
const treeParser = new Parser();
treeParser.setLanguage(quint);
const files = quintFiles(inputs);
const disagreements = [];
let checkedStructures = 0;
let skippedRejected = 0;

for (const filePath of files) {
  const source = readFileSync(filePath, "utf8");
  if (!referenceAccepts(source, filePath, reference)) {
    skippedRejected += 1;
    continue;
  }

  const actual = treeSignatures(source, treeParser);
  const expected = antlrSignatures(source, reference);
  const missing = expected
    .filter(signature => {
      if (signature.kind === "nondet_let") {
        return !actual.has(
          `nondet_binding:${signature.definitionStart}:${signature.definitionEnd}`,
        ) && !actual.has(`nested_definition_expression:${signature.start}:${signature.end}`);
      }
      return !actual.has(`${signature.kind}:${signature.start}:${signature.end}`);
    });
  checkedStructures += expected.length;

  if (missing.length === 0) {
    if (!quiet) console.log(`structure parity: ${filePath}`);
    continue;
  }

  disagreements.push({ filePath, missing });
  console.error(`structure parity failed: ${filePath}`);
}

console.log(`reference parser: ${reference.cliPath}`);
console.log(
  `checked files: ${files.length - skippedRejected}; skipped rejected: ${skippedRejected}; `
  + `structures checked: ${checkedStructures}; disagreements: ${disagreements.length}`,
);

for (const { filePath, missing } of disagreements) {
  console.error(`${filePath}\nMissing Tree-sitter structures: ${JSON.stringify(missing.slice(0, 10))}`);
}

if (disagreements.length > 0) process.exitCode = 1;
