import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Parser from "tree-sitter";
import Quint from "../../bindings/node/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function queryCaptures(queryName, fixtureName) {
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
  return query
    .captures(tree.rootNode)
    .map(({ name, node }) => [name, node.text]);
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
