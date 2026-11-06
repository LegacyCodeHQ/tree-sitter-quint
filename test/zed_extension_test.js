import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zedRoot = join(projectRoot, "editors/zed");
const zedLanguageRoot = join(zedRoot, "languages/quint");

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

test("Zed extension registers Quint and pins the grammar", () => {
  const manifest = read("editors/zed/extension.toml");
  assert.match(manifest, /^id = "quint-language-support"$/m);
  assert.match(manifest, /^name = "Quint Language Support"$/m);
  assert.match(manifest, /^version = "0\.1\.2"$/m);
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
  assert.match(config, /^line_comments = \["\/\/ ", "\/\/\/ "\]$/m);
  assert.match(
    config,
    /^block_comment = \{ start = "\/\*", prefix = "\* ", end = "\*\/", tab_size = 1 \}$/m,
  );
  assert.match(config, /^autoclose_before = ";:\.,=}\]\)"$/m);
  assert.match(
    config,
    /\{ start = '"', end = '"', close = true, newline = false, not_in = \["string"\] \}/,
  );
  assert.match(
    config,
    /\{ start = "\/\*", end = " \*\/", close = true, newline = false, not_in = \["string", "comment"\] \}/,
  );
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

test("grammar sources avoid libc functions that Zed's Wasm runtime does not provide", () => {
  // Zed compiles the grammar to WebAssembly. Tree-sitter's Wasm runtime only provides a small
  // libc subset (calloc, free, malloc, memchr, memcmp, memcpy, memmove, memset, realloc, strcmp,
  // strlen, strncat, strncmp, strncpy and the isw*/tow* functions); an unresolved import makes the
  // language fail to load. Common functions outside that subset are rejected here.
  const unsupported = [
    "qsort", "qsort_r", "bsearch", "strtol", "strtoul", "strtoll", "strtoull", "strtod", "atoi",
    "atol", "strstr", "strchr", "strrchr", "strdup", "strcpy", "strcat", "rand", "srand", "getenv",
    "exit", "abort", "printf", "fprintf", "sprintf", "snprintf", "puts", "fopen", "time", "clock",
  ];
  const pattern = new RegExp(`\\b(${unsupported.join("|")})\\s*\\(`);
  const files = readdirSync(join(projectRoot, "src")).filter((name) => /\.[ch]$/.test(name));
  assert.ok(files.includes("scanner.c"));
  for (const name of files) {
    const source = read(`src/${name}`).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const match = source.match(pattern);
    assert.equal(match, null, `src/${name} calls ${match?.[1]}, which Zed's Wasm runtime lacks`);
  }
});

test("Zed queries compile and highlight diagnostics against the pinned grammar", () => {
  execFileSync(process.execPath, [join(projectRoot, "scripts/check-zed-grammar.mjs")], {
    cwd: projectRoot,
    stdio: "pipe", encoding: "utf8",
  });
});
