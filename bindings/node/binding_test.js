import assert from "node:assert";
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

  for (const [before, after] of sources.slice(1).flatMap((source, index) => [
    [sources[index], source],
    [source, sources[index]],
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
