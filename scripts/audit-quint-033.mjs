import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateCases } from './quint-033-cases.mjs';
import { generateDeepCases } from './quint-033-deep-cases.mjs';
import { generateLocalBodyCases } from './quint-033-body-cases.mjs';
import { generateQuickCases } from './quint-033-quick-cases.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = realpathSync(process.env.QUINT_CLI ?? join(root,
  'test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js'));
const version = JSON.parse(readFileSync(join(dirname(cli), '../../package.json'), 'utf8')).version;
assert.equal(version, '0.33.0', `Audit requires exactly Quint 0.33.0; found ${version}`);
const require = createRequire(cli);
const { parsePhase1fromText } = require(join(dirname(cli), 'parsing/quintParserFrontend.js'));
const { newIdGenerator } = require(join(dirname(cli), 'idGenerator.js'));
assert(!(process.argv.includes('--quick') && process.argv.includes('--deep')), 'Choose --quick or --deep, not both');
const matrix = process.argv.includes('--quick') ? 'quick' : process.argv.includes('--deep') ? 'deep' : 'boundary';
const cases = matrix === 'quick' ? generateQuickCases()
  : matrix === 'deep' ? [...generateDeepCases(), ...generateLocalBodyCases()] : generateCases();
const expected = {
  quick: { count: 348, sha256: 'c55f13d2f336b3c0092af118b112964263f697fca1203bb2919dbdb8d7976005' },
  deep: { count: 46648, sha256: '5e2c841462d203422d23555abdd5b0979c4431d8d4e3d304b08426746c0ea831' },
  boundary: { count: 8259, sha256: '53f86c51ef5bce612df1bd5bbd7e7baf9a09d945144b74312d6b19b341271447' },
}[matrix];
const digest = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
assert.equal(cases.length, expected.count, 'Unexpected audit matrix size');
assert.equal(digest, expected.sha256,
  'Audit matrix changed: review coverage and update its fingerprint deliberately');
const parent = resolve(process.env.QUINT_AUDIT_ARTIFACTS ?? tmpdir());
mkdirSync(parent, { recursive: true });
const scratch = mkdtempSync(join(parent, `quint-033-${matrix}-`));
const parserDigest = () => {
  const hash = createHash('sha256');
  for (const file of ['src/parser.c', 'src/scanner.c', 'src/quint_033_atn.h',
    'src/quint_boundaries.h', 'src/quint_scanner_boundary_state.h', 'src/node-types.json',
    'build/Release/tree_sitter_quint_binding.node']) {
    hash.update(file).update('\0').update(readFileSync(join(root, file)));
  }
  return hash.digest('hex');
};
const grammarSha256 = parserDigest();
const accepted = join(scratch, 'accepted');
const rejected = join(scratch, 'rejected');
mkdirSync(accepted);
mkdirSync(rejected);
let acceptedCount = 0;
let succeeded = false;
try {
  console.log(`Classifying ${cases.length} Quint 0.33.0 ${matrix} cases`);
  for (const entry of cases) {
    const debug = console.debug;
    let valid;
    try {
      console.debug = () => {};
      valid = parsePhase1fromText(newIdGenerator(), entry.source, entry.name).errors.length === 0;
    } finally {
      console.debug = debug;
    }
    if (valid) acceptedCount++;
    writeFileSync(join(valid ? accepted : rejected, entry.name), entry.source);
  }
  const summary = { reference: version, matrix, coverage: matrix === 'quick' ? 'representative' : 'exhaustive',
    grammarSha256, cases: cases.length, accepted: acceptedCount,
    rejected: cases.length - acceptedCount, sha256: digest,
    families: Object.fromEntries([...new Set(cases.map(c => c.family))].map(family =>
      [family, cases.filter(c => c.family === family).length])) };
  writeFileSync(join(scratch, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  let failed = false;
  for (const [layer, inputs] of [
    ['syntax-acceptance', [accepted, rejected]],
    ['parse-structure', [accepted]],
    ['tokenization', [accepted]],
    // Full alternative/token coverage regenerates the whole boundary matrix.
    // Keep it in exhaustive runs; the quick sample makes no coverage claim.
    ...(matrix === 'quick' ? [] : [['reference-coverage', [join(root, 'test/fixtures')]]]),
  ]) {
    assert.equal(parserDigest(), grammarSha256, 'Parser changed during the audit; rerun against one grammar snapshot');
    const script = join(root, layer === 'reference-coverage'
      ? 'scripts/check-reference-coverage.mjs' : `scripts/check-${layer}-parity.mjs`);
    console.log(`Starting ${matrix} ${layer}`);
    const started = performance.now();
    const result = spawnSync(process.execPath, [script, '--quiet', ...inputs], {
      cwd: root, env: { ...process.env, QUINT_CLI: cli, QUINT_COVERAGE_REPORT: join(scratch, 'reference-coverage.json') }, encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? '\n' + result.error.stack : ''}`;
    writeFileSync(join(scratch, `${layer}.log`), log);
    console.log(log.trim());
    console.log(`Finished ${matrix} ${layer} in ${((performance.now() - started) / 1000).toFixed(2)}s`);
    if (result.status !== 0 || result.error) failed = true;
  }
  assert.equal(parserDigest(), grammarSha256, 'Parser changed during the audit; rerun against one grammar snapshot');
  assert(!failed, 'Differential audit failed; see the retained checker logs');
  succeeded = true;
  console.log(`Quint ${version} ${matrix} audit passed: ${cases.length} cases (${acceptedCount} accepted, ${cases.length - acceptedCount} rejected); sha256 ${digest}`);
} finally {
  if (succeeded) rmSync(scratch, { recursive: true, force: true });
  else console.error(`Audit sources and logs retained at ${scratch}\nReproduce a case with QUINT_CLI=${cli} node scripts/check-syntax-acceptance-parity.mjs <case.qnt>`);
}
