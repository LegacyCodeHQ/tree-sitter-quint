import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const publishedTagsPath = process.argv[2];
if (!publishedTagsPath) throw new Error('Expected a file listing published stable release tags');
const publishedTags = new Set(readFileSync(publishedTagsPath, 'utf8').split(/\s+/));

const target = git('rev-parse', 'HEAD');
const baseline = git('tag', '--merged', target, '--list', 'v*', '--sort=-version:refname')
  .split('\n')
  .find(tag => /^v\d+\.\d+\.\d+$/.test(tag)
    && publishedTags.has(tag)
    && git('rev-parse', `refs/tags/${tag}^{commit}`) !== target);

if (!baseline) {
  console.error('No earlier published stable tag in this release’s history. Run exhaustive audits.');
  console.log('exhaustive=true');
  process.exit(0);
}

function readJson(ref, path) {
  return JSON.parse(git('show', `${ref}:${path}`));
}

function parserInputs(ref) {
  const manifest = readJson(ref, 'package.json');
  const config = readJson(ref, 'tree-sitter.json');
  return {
    quintVersion: manifest.quintVersion,
    quintDependency: manifest.devDependencies['@informalsystems/quint'],
    treeSitterCli: manifest.devDependencies['tree-sitter-cli'],
    grammars: config.grammars,
  };
}

// check:generated verifies parser.c from these inputs, so a change confined to
// the generated parser's package version cannot trigger an exhaustive audit.
const changed = git('diff', '--name-only', baseline, target, '--',
  'grammar.js', 'grammar/', 'src/', ':(exclude)src/parser.c', 'bun.lock',
  'scripts/generate-reference-atn.mjs', ':(glob)test/reference-quint*/**');
const inputsChanged = JSON.stringify(parserInputs(baseline)) !== JSON.stringify(parserInputs(target));

console.error(`Compared parser inputs with ${baseline}.`);
if (changed) console.error(changed);
if (inputsChanged) console.error('Parser pins or grammar configuration changed.');
console.log(`exhaustive=${Boolean(changed || inputsChanged)}`);
