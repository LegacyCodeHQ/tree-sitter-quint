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
