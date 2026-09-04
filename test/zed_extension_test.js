import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Parser from "tree-sitter";
import Quint from "../bindings/node/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zedRoot = join(projectRoot, "editors/zed");
const zedLanguageRoot = join(zedRoot, "languages/quint");

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

test("Zed extension registers Quint and pins the grammar", () => {
  const manifest = read("editors/zed/extension.toml");
  assert.match(manifest, /^id = "quint"$/m);
  assert.match(manifest, /^name = "Quint"$/m);
  assert.match(manifest, /^version = "0\.1\.0"$/m);
  assert.match(manifest, /^schema_version = 1$/m);
  assert.match(manifest, /^\[grammars\.quint\]$/m);
  assert.match(
    manifest,
    /^commit = "[0-9a-f]{40}"$/m,
    "grammar must be pinned to an immutable commit",
  );

  const config = read("editors/zed/languages/quint/config.toml");
  assert.match(config, /^name = "Quint"$/m);
  assert.match(config, /^grammar = "quint"$/m);
  assert.match(config, /^path_suffixes = \["qnt", "quint"\]$/m);
  assert.match(config, /^line_comments = \["\/\/ "\]$/m);
  assert.match(config, /^tab_size = 2$/m);
  assert.match(config, /^hard_tabs = false$/m);
});

test("Zed extension carries its required license", () => {
  assert.equal(read("editors/zed/LICENSE"), read("LICENSE"));
});

test("Zed structural queries stay synchronized with the grammar package", () => {
  for (const queryName of ["brackets.scm", "indents.scm", "outline.scm"]) {
    assert.equal(
      readFileSync(join(zedLanguageRoot, queryName), "utf8"),
      readFileSync(join(projectRoot, "queries", queryName), "utf8"),
      `${queryName} differs from the reusable query`,
    );
  }
});

test("Zed highlighting is the documented adaptation of the reusable query", () => {
  const expected = read("queries/highlights.scm")
    .replaceAll("@module", "@type")
    .replaceAll("@comment.documentation", "@comment.doc");
  assert.equal(read("editors/zed/languages/quint/highlights.scm"), expected);
});

test("all Zed Tree-sitter queries compile", () => {
  for (const queryName of [
    "brackets.scm",
    "highlights.scm",
    "indents.scm",
    "outline.scm",
  ]) {
    assert.doesNotThrow(
      () =>
        new Parser.Query(
          Quint,
          readFileSync(join(zedLanguageRoot, queryName), "utf8"),
        ),
      queryName,
    );
  }
});
