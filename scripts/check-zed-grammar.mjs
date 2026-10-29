import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const manifest = readFileSync(join(projectRoot, "editors/zed/extension.toml"), "utf8");
const grammar = manifest.match(/^\[grammars\.quint\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
assert(grammar, "missing [grammars.quint] in the Zed manifest");
const commit = grammar.match(/^commit = "([0-9a-f]{40})"$/m)?.[1];
assert(commit, "Zed must pin a full, immutable grammar commit");
const repository = grammar.match(/^repository = "([^"]+)"$/m)?.[1];
const packageManifest = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
assert.equal(repository, packageManifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""));

try {
  execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: projectRoot, stdio: "pipe" });
} catch {
  throw new Error(`Pinned Zed grammar ${commit} is missing from local history. Fetch it before testing; CI uses fetch-depth: 0.`);
}

const scratch = mkdtempSync(join(tmpdir(), "quint-zed-pin-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = {
  ...process.env,
  npm_config_cache: join(scratch, "npm-cache"),
  npm_config_ignore_scripts: "false",
  npm_config_dry_run: "false",
};
// Official Node distributions and Homebrew include headers beside bin/node.
// Use those directly when available rather than downloading another copy.
const nodePrefix = dirname(dirname(realpathSync(process.execPath)));
const nodeHeaders = process.env.npm_config_nodedir
  ?? (existsSync(join(nodePrefix, "include/node/node.h")) ? nodePrefix : undefined);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: scratch,
    encoding: "utf8",
    env: environment,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  const archive = execFileSync("git", [
    "archive", "--format=tar", commit, "src", "bindings/node", "binding.gyp",
  ], { cwd: projectRoot, maxBuffer: 32 * 1024 * 1024 });
  run("tar", ["-xf", "-", "-C", scratch], { input: archive });
  mkdirSync(join(scratch, "node_modules"));
  // GYP writes makefiles beside this dependency's sources, so it needs a real
  // copy inside the scratch checkout rather than an escaping dependency symlink.
  cpSync(join(projectRoot, "node_modules/node-addon-api"), join(scratch, "node_modules/node-addon-api"), { recursive: true, dereference: true });
  for (const dependency of ["node-gyp-build", "tree-sitter"]) {
    symlinkSync(join(projectRoot, "node_modules", dependency), join(scratch, "node_modules", dependency), process.platform === "win32" ? "junction" : "dir");
  }
  writeFileSync(join(scratch, "package.json"), JSON.stringify({
    name: "quint-zed-pinned-grammar-check",
    private: true,
    type: "module",
    scripts: { build: "node-gyp rebuild" },
  }));
  run(npm, ["run", "build", "--", "--devdir", join(scratch, "node-headers"),
    ...(nodeHeaders ? ["--nodedir", nodeHeaders] : []),
  ]);

  // A separate process unloads the native library before the scratch cleanup.
  run(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { readFileSync, readdirSync } from "node:fs";
    import { join } from "node:path";
    import { pathToFileURL } from "node:url";
    import Parser from "tree-sitter";
    const [bindingPath, queryDirectory, fixtures] = process.argv.slice(1);
    const { default: language } = await import(pathToFileURL(bindingPath).href);
    const parser = new Parser();
    parser.setLanguage(language);
    const queries = new Map();
    for (const filename of readdirSync(queryDirectory).filter(name => name.endsWith(".scm")).sort()) {
      queries.set(filename, new Parser.Query(language, readFileSync(join(queryDirectory, filename), "utf8")));
    }
    const invalid = parser.parse(readFileSync(join(fixtures, "syntax-greedy-reserved-boundary.qnt"), "utf8"));
    assert.equal(invalid.rootNode.descendantsOfType("invalid_identifier").length, 1);
    assert.deepEqual(queries.get("highlights.scm").captures(invalid.rootNode)
      .filter(capture => capture.name === "error").map(capture => capture.node.text), ["or"]);
    const valid = parser.parse(readFileSync(join(fixtures, "structure-greedy-reserved-semicolon.qnt"), "utf8"));
    assert.equal(valid.rootNode.hasError, false);
    assert.equal(valid.rootNode.descendantsOfType("invalid_identifier").length, 0);
  `, join(scratch, "bindings/node/index.js"), join(projectRoot, "editors/zed/languages/quint"), join(projectRoot, "test/fixtures")]);
  console.log(`Zed queries and diagnostic smoke tests passed against pinned grammar ${commit}`);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
