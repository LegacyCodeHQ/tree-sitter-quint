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

console.log(`release version verified: ${expected}`);
