import assert from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Parser from "tree-sitter";

test("can load grammar", () => {
  const parser = new Parser();
  assert.doesNotReject(async () => {
    const { default: language } = await import("./index.js");
    parser.setLanguage(language);
  });
});

test("exposes declaration, expression, type, and block-combinator supertypes", async () => {
  const { default: language } = await import("./index.js");
  const supertypes = new Map(
    language.nodeTypeInfo
      .filter((node) => "subtypes" in node)
      .map((node) => [node.type, node.subtypes.map((subtype) => subtype.type)]),
  );

  assert.ok(supertypes.has("_declaration"));
  assert.ok(supertypes.has("_expression"));
  assert.ok(supertypes.has("_type"));
  assert.deepEqual(supertypes.get("_block_combinator_expression"), [
    "all_expression",
    "and_block_expression",
    "any_expression",
    "or_block_expression",
  ]);
});

test("incremental edits across local binding continuations match fresh parsing", async () => {
  const { default: language } = await import("./index.js");
  const parser = new Parser();
  parser.setLanguage(language);
  const continuations = [
    "",
    "\n/* chain */\n.append(2)",
    "\n/* chain */\n.append(2)\n[0]",
    "\n\n/* a longer\n comment */\n.append(2)\n\n[0]",
  ];
  const sources = continuations.map(continuation =>
    "module Incremental { pure def value = { val xs = List(1)\n"
    + continuation + "\nxs } }\n",
  );
  const point = (source, index) => {
    const lines = source.slice(0, index).split("\n");
    return { row: lines.length - 1, column: lines.at(-1).length };
  };
  const ranges = tree => {
    const result = [];
    const visit = node => {
      result.push([node.type, node.startIndex, node.endIndex, node.isMissing]);
      node.children.forEach(visit);
    };
    visit(tree.rootNode);
    return result;
  };

  const pairs = sources.slice(1).map((source, index) => [sources[index], source]);
  const nulSource = readFileSync(new URL("../../test/fixtures/lexical-nul-characters.qnt", import.meta.url), "utf8");
  for (const replacement of ["", "ordinary", "\0\0"]) {
    pairs.push([nulSource, nulSource.replaceAll("\0", replacement)]);
  }
  for (const [fixture, boundary] of [
    ["structure-local-operator-boundaries.qnt", "def f = x"],
    ["structure-prefix-local-boundaries.qnt", "else -x"],
    ["structure-nondet-boundaries.qnt", ".oneOf()"],
    ["structure-assignment-closure.qnt", "x' = 2"],
    ["syntax-greedy-reserved-boundary.qnt", "def local = identity"],
    ["syntax-greedy-equals-boundary.qnt", "def first(p) = value"],
    ["syntax-greedy-nested-call.qnt", "def local() = source"],
    ["syntax-greedy-assignment-subtraction.qnt", "def first() = { val local = { a: 1 } () }"],
    ["syntax-greedy-assignment-chain.qnt", "def first() = { val local = {a: 1} () }"],
    ["syntax-greedy-minus-local-definition.qnt", "val saved = seed"],
    ["syntax-greedy-minus-local-definition.qnt", "def earlier() = seed"],
    ["structure-nested-index-boundary.qnt", "values[0]"],
    ["structure-nested-ufcs-boundary.qnt", "1.keep()"],
    ["structure-nested-subtraction-body.qnt", "-seed"],
    ["structure-bare-value-header.qnt", "val placeholder"],
  ]) {
    const before = readFileSync(new URL(`../../test/fixtures/${fixture}`, import.meta.url), "utf8");
    pairs.push([before, before.replaceAll(`${boundary}\n`, `${boundary};\n`)]);
  }

  for (const [before, after] of pairs.flatMap(([before, after]) => [
    [before, after], [after, before],
  ])) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let oldEnd = before.length;
    let newEnd = after.length;
    while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    const previous = parser.parse(before);
    assert.equal(previous.rootNode.hasError, false);
    previous.edit({
      startIndex: start,
      oldEndIndex: oldEnd,
      newEndIndex: newEnd,
      startPosition: point(before, start),
      oldEndPosition: point(before, oldEnd),
      newEndPosition: point(after, newEnd),
    });
    const incremental = parser.parse(after, previous);
    const fresh = parser.parse(after);
    assert.equal(fresh.rootNode.hasError, false);
    assert.equal(incremental.rootNode.toString(), fresh.rootNode.toString());
    assert.deepEqual(ranges(incremental), ranges(fresh));
  }
});
