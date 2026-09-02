import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import Parser from "tree-sitter";

import quint from "../bindings/node/index.js";

const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error("usage: node scripts/check-tokenization-parity.mjs <file.qnt> [...]");
  process.exit(2);
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

function loadReferenceLexer() {
  const cliPath = resolveQuintCli();
  const require = createRequire(cliPath);
  const { CharStreams, Token } = require("antlr4ts");
  const { QuintLexer } = require(path.join(path.dirname(cliPath), "generated", "QuintLexer.js"));
  return { CharStreams, QuintLexer, Token, cliPath };
}

function normalizeText(kind, text) {
  if (kind === "hashbang" || kind === "documentation_comment") {
    return text.replace(/\r?\n$/, "");
  }
  return text;
}

function referenceTokens(source, reference) {
  const lexer = new reference.QuintLexer(reference.CharStreams.fromString(source));
  const errors = [];
  lexer.removeErrorListeners();
  lexer.addErrorListener({
    syntaxError: (_recognizer, _symbol, line, column, message) => {
      errors.push(`${line}:${column}: ${message}`);
    },
  });

  const tokens = [];
  for (;;) {
    const token = lexer.nextToken();
    if (token.type === reference.Token.EOF) {
      break;
    }

    const symbolicName = reference.QuintLexer.VOCABULARY.getSymbolicName(token.type);
    const kind = {
      STRING: "string",
      BOOL: "boolean",
      INT: "integer",
      LOW_ID: "identifier",
      CAP_ID: "identifier",
      HASHBANG_LINE: "hashbang",
      DOCCOMMENT: "documentation_comment",
    }[symbolicName] ?? token.text;

    tokens.push({
      kind,
      text: normalizeText(kind, token.text),
    });
  }

  assert.deepEqual(errors, [], `ANTLR lexical errors:\n${errors.join("\n")}`);
  return tokens;
}

function treeSitterTokens(source, parser) {
  const tree = parser.parse(source);

  const tokens = [];
  function visit(node) {
    if (node.childCount > 0) {
      for (const child of node.children) {
        visit(child);
      }
      return;
    }

    if (node.type === "comment" || node.type === "_newline") {
      return;
    }

    const kind = node.text === "true" || node.text === "false"
      ? "boolean"
      : ({
      string_literal: "string",
      integer_literal: "integer",
      identifier: "identifier",
      type_variable: "identifier",
      }[node.type] ?? node.type);

    tokens.push({
      kind,
      text: normalizeText(kind, node.text),
    });
  }

  visit(tree.rootNode);
  return tokens;
}

const reference = loadReferenceLexer();
const parser = new Parser();
parser.setLanguage(quint);

for (const filePath of paths) {
  const source = readFileSync(filePath, "utf8");
  const expected = referenceTokens(source, reference);
  const actual = treeSitterTokens(source, parser);
  assert.deepEqual(actual, expected, `Tokenization differs for ${filePath}`);
  console.log(`token parity: ${filePath} (${actual.length} tokens)`);
}

console.log(`reference lexer: ${reference.cliPath}`);
