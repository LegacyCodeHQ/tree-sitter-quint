import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Parser from "tree-sitter";
import Quint from "../../bindings/node/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function queryCaptureRecords(queryName, fixtureName) {
  const source = readFileSync(
    join(projectRoot, "test/query", fixtureName),
    "utf8",
  );
  const parser = new Parser();
  parser.setLanguage(Quint);
  const tree = parser.parse(source);
  assert.equal(tree.rootNode.hasError, false);

  const query = new Parser.Query(
    Quint,
    readFileSync(join(projectRoot, "queries", queryName)),
  );
  return query.captures(tree.rootNode).map(({ name, node }) => ({
    name,
    nodeType: node.type,
    text: node.text,
  }));
}

function queryCaptures(queryName, fixtureName) {
  return queryCaptureRecords(queryName, fixtureName).map(({ name, text }) => [
    name,
    text,
  ]);
}

test("bracket query pairs Quint delimiters", () => {
  assert.deepEqual(queryCaptures("brackets.scm", "brackets.qnt"), [
    ["open", "{"],
    ["open", "("],
    ["close", ")"],
    ["open", "["],
    ["close", "]"],
    ["open", "{"],
    ["close", "}"],
    ["close", "}"],
  ]);
});

test("indent query captures structural containers and closing delimiters", () => {
  const captures = queryCaptureRecords("indents.scm", "indents.qnt");
  const indentedTypes = new Set(
    captures
      .filter(({ name }) => name === "indent")
      .map(({ nodeType }) => nodeType),
  );

  for (const nodeType of [
    "module_definition",
    "block_expression",
    "all_expression",
    "match_expression",
    "match_arm",
    "call_expression",
    "list_literal",
    "tuple_literal",
    "record_literal",
    "tuple_type",
    "record_type",
    "list_type",
  ]) {
    assert.ok(indentedTypes.has(nodeType), `missing @indent for ${nodeType}`);
  }
  assert.ok(captures.some(({ name }) => name === "outdent"));
});

test("outline query exposes Quint modules and declarations", () => {
  const captures = queryCaptureRecords("outline.scm", "outline.qnt");
  const names = captures
    .filter(({ name }) => name === "name")
    .map(({ text }) => text);
  const itemTypes = new Set(
    captures
      .filter(({ name }) => name === "item")
      .map(({ nodeType }) => nodeType),
  );

  assert.deepEqual(names, [
    "Outline",
    "LIMIT",
    "count",
    "Positive",
    "Choice",
    "MEMBER",
    "initial",
    "increment",
    "C",
  ]);
  for (const nodeType of [
    "module_definition",
    "constant_declaration",
    "variable_declaration",
    "assumption_declaration",
    "type_alias_declaration",
    "uninterpreted_type_declaration",
    "value_definition",
    "operator_definition",
    "instance_declaration",
  ]) {
    assert.ok(itemTypes.has(nodeType), `missing @item for ${nodeType}`);
  }
});
