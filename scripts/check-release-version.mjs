import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tag = process.argv[2];
assert(tag, "usage: node scripts/check-release-version.mjs <vVERSION>");
assert(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag), `invalid release tag: ${tag}`);

const projectRoot = resolve(import.meta.dirname, "..");
const packageManifest = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const treeSitterManifest = JSON.parse(readFileSync(resolve(projectRoot, "tree-sitter.json"), "utf8"));
const expected = tag.slice(1);

assert.equal(packageManifest.version, expected, `package.json version must match ${tag}`);
assert.equal(treeSitterManifest.metadata.version, expected, `tree-sitter.json version must match ${tag}`);
assert.equal(
  expected.split("-", 1)[0],
  packageManifest.quintVersion,
  `the release version must be based on Quint ${packageManifest.quintVersion}`,
);
assert.equal(
  packageManifest.devDependencies["@informalsystems/quint"],
  packageManifest.quintVersion,
  "the pinned Quint compiler version must match package.json quintVersion",
);

const versionPatterns = new Map([
  ["Cargo.toml", /^version = "([^"]+)"/m],
  ["pyproject.toml", /^version = "([^"]+)"/m],
  ["CMakeLists.txt", /^\s*VERSION "([^"]+)"/m],
  ["Makefile", /^VERSION := (\S+)/m],
  ["pom.xml", /^\s*<version>([^<]+)<\/version>/m],
  ["build.zig.zon", /^\s*\.version = "([^"]+)",/m],
]);

for (const [filename, pattern] of versionPatterns) {
  const contents = readFileSync(resolve(projectRoot, filename), "utf8");
  const match = contents.match(pattern);
  assert(match, `could not find the version in ${filename}`);
  assert.equal(match[1], expected, `${filename} version must match ${tag}`);
}

console.log(`release version verified: ${expected} (Quint ${packageManifest.quintVersion})`);
