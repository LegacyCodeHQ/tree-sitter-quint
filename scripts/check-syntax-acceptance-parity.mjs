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
  console.error("usage: node scripts/check-syntax-acceptance-parity.mjs <file-or-directory> [...]");
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
    const executable = execFileSync("which", ["quint"], { encoding: "utf8" }).trim();
    return realpathSync(executable);
  } catch {
    throw new Error("Cannot find Quint. Install it or set QUINT_CLI to its executable.");
  }
}

function loadReferenceParser() {
  const cliPath = resolveQuintCli();
  const require = createRequire(cliPath);
  const { parsePhase1fromText } = require(
    path.join(path.dirname(cliPath), "parsing", "quintParserFrontend.js"),
  );
  const { newIdGenerator } = require(path.join(path.dirname(cliPath), "idGenerator.js"));
  return { parsePhase1fromText, newIdGenerator, cliPath };
}

function referenceResult(source, filePath, reference) {
  const previousDebug = console.debug;
  console.debug = () => {};
  try {
    const result = reference.parsePhase1fromText(
      reference.newIdGenerator(),
      source,
      filePath,
    );
    return {
      accepted: result.errors.length === 0,
      detail: result.errors.slice(0, 3).map(error => `${error.code}: ${error.message}`).join("; "),
    };
  } catch (error) {
    return {
      accepted: false,
      detail: `exception: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    console.debug = previousDebug;
  }
}

function firstTreeError(node) {
  if (node.isError || node.isMissing) {
    return node;
  }
  for (const child of node.children) {
    const error = firstTreeError(child);
    if (error) {
      return error;
    }
  }
  return undefined;
}

function treeSitterResult(source, parser) {
  const tree = parser.parse(source);
  const error = firstTreeError(tree.rootNode);
  return {
    accepted: !tree.rootNode.hasError,
    detail: error
      ? `${error.type} at ${error.startPosition.row + 1}:${error.startPosition.column + 1}`
      : "",
  };
}

const reference = loadReferenceParser();
const parser = new Parser();
parser.setLanguage(quint);
const files = quintFiles(inputs);
const disagreements = [];
let accepted = 0;
let rejected = 0;

for (const filePath of files) {
  const source = readFileSync(filePath, "utf8");
  const expected = referenceResult(source, filePath, reference);
  const actual = treeSitterResult(source, parser);

  if (expected.accepted === actual.accepted) {
    expected.accepted ? accepted += 1 : rejected += 1;
    if (!quiet) {
      console.log(`syntax parity: ${filePath} (${expected.accepted ? "accepted" : "rejected"})`);
    }
    continue;
  }

  disagreements.push({ filePath, expected, actual });
  console.error(`syntax parity failed: ${filePath}`);
}

console.log(`reference parser: ${reference.cliPath}`);
console.log(
  `checked files: ${files.length}; accepted: ${accepted}; rejected: ${rejected}; disagreements: ${disagreements.length}`,
);

for (const disagreement of disagreements) {
  console.error(
    `${disagreement.filePath}\n`
    + `ANTLR: ${disagreement.expected.accepted ? "accepted" : "rejected"}`
    + `${disagreement.expected.detail ? ` (${disagreement.expected.detail})` : ""}\n`
    + `Tree-sitter: ${disagreement.actual.accepted ? "accepted" : "rejected"}`
    + `${disagreement.actual.detail ? ` (${disagreement.actual.detail})` : ""}`,
  );
}

if (disagreements.length > 0) {
  process.exitCode = 1;
}
