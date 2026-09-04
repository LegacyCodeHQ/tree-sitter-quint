import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const scratch = mkdtempSync(join(tmpdir(), "tree-sitter-quint-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const bun = process.platform === "win32" ? "bun.exe" : "bun";
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(scratch, "npm-cache"),
  npm_config_dry_run: "false",
};

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: npmEnvironment,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }

  return result.stdout;
}

try {
  const packOutput = run(npm, [
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    scratch,
  ]);
  const [packed] = JSON.parse(packOutput);
  const packagedFiles = new Set(packed.files.map(({ path }) => path));
  const expectedFiles = new Set([
    "LICENSE",
    "NOTICE",
    "README.md",
    "binding.gyp",
    "bindings/node/binding.cc",
    "bindings/node/index.js",
    "bindings/node/index.d.ts",
    "package.json",
    "queries/brackets.scm",
    "queries/highlights.scm",
    "queries/locals.scm",
    "src/node-types.json",
    "src/parser.c",
    "src/scanner.c",
    "src/tree_sitter/parser.h",
  ]);

  assert.deepEqual(
    [...packagedFiles].sort(),
    [...expectedFiles].sort(),
    "npm package contents differ from the audited allowlist",
  );

  const tarball = join(scratch, packed.filename);
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    npm,
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      tarball,
      "tree-sitter@0.25.1",
    ],
    scratch,
  );

  writeFileSync(
    join(scratch, "smoke.mjs"),
    `import Parser from "tree-sitter";
import Quint from "@legacycodehq/tree-sitter-quint";

const parser = new Parser();
parser.setLanguage(Quint);
const tree = parser.parse("module Smoke {}");
if (tree.rootNode.hasError) {
  throw new Error(tree.rootNode.toString());
}
`,
  );
  run(process.execPath, [join(scratch, "smoke.mjs")], scratch);
  run(bun, [join(scratch, "smoke.mjs")], scratch);

  const manifest = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  console.log(`npm package smoke test passed: ${manifest.name}@${manifest.version}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
