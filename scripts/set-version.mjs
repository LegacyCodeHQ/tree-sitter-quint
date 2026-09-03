import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
const quintVersion = process.argv[3] ?? version?.split("-", 1)[0];
assert(version, "usage: bun run version:set <package-version> [quint-version]");
assert(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version),
  `invalid semantic version: ${version}`,
);
assert(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(quintVersion),
  `invalid Quint version: ${quintVersion}`,
);

const projectRoot = resolve(import.meta.dirname, "..");
const executableSuffix = process.platform === "win32" ? ".exe" : "";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
}

function replaceExactlyOnce(filename, pattern, replacement) {
  const path = resolve(projectRoot, filename);
  const contents = readFileSync(path, "utf8");
  const matches = contents.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  assert.equal(matches?.length, 1, `expected exactly one version field in ${filename}`);
  writeFileSync(path, contents.replace(pattern, replacement));
}

run(`tree-sitter${executableSuffix}`, ["version", version]);

replaceExactlyOnce("package.json", /(^\s*\"version\":\s*)\"[^\"]+\"/m, `$1"${version}"`);
replaceExactlyOnce("tree-sitter.json", /(\"version\":\s*)\"[^\"]+\"/, `$1"${version}"`);
replaceExactlyOnce("Cargo.toml", /(^version = )\"[^\"]+\"/m, `$1"${version}"`);
replaceExactlyOnce("pyproject.toml", /(^version = )\"[^\"]+\"/m, `$1"${version}"`);
replaceExactlyOnce("CMakeLists.txt", /(^\s*VERSION )\"[^\"]+\"/m, `$1"${version}"`);
replaceExactlyOnce("Makefile", /(^VERSION := )\S+/m, `$1${version}`);
replaceExactlyOnce(
  "pom.xml",
  /(<artifactId>jtreesitter-quint<\/artifactId>\s*<name>[^<]+<\/name>\s*)<version>[^<]+<\/version>/,
  `$1<version>${version}</version>`,
);
replaceExactlyOnce("build.zig.zon", /(^\s*\.version = )\"[^\"]+\"/m, `$1"${version}"`);
replaceExactlyOnce(
  "package.json",
  /(\"@informalsystems\/quint\":\s*)\"[^\"]+\"/,
  `$1"${quintVersion}"`,
);
replaceExactlyOnce(
  "package.json",
  /(\"quintVersion\":\s*)\"[^\"]+\"/,
  `$1"${quintVersion}"`,
);

run(`bun${executableSuffix}`, ["install"]);
run(`tree-sitter${executableSuffix}`, ["generate"]);
run(process.execPath, ["scripts/check-release-version.mjs", `v${version}`]);

console.log(`set package version to ${version} for Quint ${quintVersion}`);
