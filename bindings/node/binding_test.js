import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
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
    ["structure-nested-parenthesized-body.qnt", "    (seed)"],
    ["syntax-header-continuation.qnt", "def pendingHeader()"],
    ["structure-operator-arithmetic-body.qnt", "-seed"],
    ["structure-complete-header-parameters.qnt", "def pendingHeader()"],
    ["structure-parameterized-header-bodies.qnt", "def pendingHeader(p)"],
    ["structure-arithmetic-list-body.qnt", "val inner = seed"],
    ["structure-arithmetic-list-body.qnt", "def inner() = seed"],
    ["structure-prefix-delimited-bodies.qnt", "    (seed)"],
    ["structure-unary-call-body.qnt", "    (0)"],
    ["structure-postfix-delimited-body.qnt", "    -seed"],
    ["structure-delimited-arithmetic-body.qnt", "    (2)"],
    ["structure-indexed-prefix-initializer.qnt", "else values[0]"],
    ["structure-prefix-local-bodies.qnt", "    (0)"],
    ["structure-compound-prefix-edge.qnt", "p => seed"],
    ["structure-unary-local-body-precedence.qnt", "    -seed / seed"],
    ["structure-local-body-operand-levels.qnt", "1 - seed"],
    ["structure-power-local-body.qnt", "    -seed ^ 2"],
    ["structure-local-connective-precedence.qnt", "  ready or ready and ready"],
    ["structure-local-relation-precedence.qnt", "  pure def result = def previous = val saved = recordValue.a"],
    ["structure-header-body-index-continuation.qnt", "    seed()"],
    ["structure-successive-initializer-calls.qnt", "  val saved = def first = number(0)"],
    ["syntax-greedy-nondet-header.qnt", "  -seed"],
    ["syntax-greedy-value-division.qnt", "  (0) / def later() = 1"],
  ]) {
    const before = readFileSync(new URL(`../../test/fixtures/${fixture}`, import.meta.url), "utf8");
    const after = before.replaceAll(`${boundary}\n`, `${boundary};\n`);
    assert.notEqual(before, after, `Fixture boundary not found in ${fixture}`);
    pairs.push([before, after]);
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

test("token-preserving edits and recovery transitions match independent fresh trees", async () => {
  const { default: language } = await import("./index.js");
  const snapshot = node => [node.type, node.isNamed, node.isMissing, node.hasError,
    node.startIndex, node.endIndex, node.startPosition, node.endPosition,
    node.children.map((child, i) => [node.fieldNameForChild(i), snapshot(child)])];
  const point = (source, index) => {
    const lines = source.slice(0, index).split("\n");
    return { row: lines.length - 1, column: lines.at(-1).length };
  };
  const directory = new URL("../../test/fixtures/", import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith(".qnt")).sort()) {
    const original = readFileSync(new URL(file, directory), "utf8");
    const parser = new Parser();
    parser.setLanguage(language);
    let before = original, tree = parser.parse(original);
    const renamed = original.replace(/(module\s+)([A-Za-z_][A-Za-z_0-9]*)/, "$1$2Renamed");
    for (const after of ["/* \u03bb \ud83c\udf33 \0 */\n" + original, renamed,
      original + "/* unfinished", original, original.replace(/}([^}]*)$/, "$1"), original]) {
      // A whole-buffer edit exercises scanner state restoration without hiding
      // changed byte ranges behind a reused declaration in the test harness.
      tree.edit({ startIndex: 0, oldEndIndex: before.length, newEndIndex: after.length,
        startPosition: { row: 0, column: 0 }, oldEndPosition: point(before, before.length),
        newEndPosition: point(after, after.length) });
      tree = parser.parse(after, tree);
      const freshParser = new Parser();
      freshParser.setLanguage(language);
      const fresh = freshParser.parse(after);
      assert.deepEqual(snapshot(tree.rootNode), snapshot(fresh.rootNode), file);
      before = after;
    }
  }
});
