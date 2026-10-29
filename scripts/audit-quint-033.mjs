import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateCases } from './quint-033-cases.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = realpathSync(process.env.QUINT_CLI ?? join(root,
  'test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js'));
const version = JSON.parse(readFileSync(join(dirname(cli), '../../package.json'), 'utf8')).version;
assert.equal(version, '0.33.0', `Audit requires exactly Quint 0.33.0; found ${version}`);
const require = createRequire(cli);
const { parsePhase1fromText } = require(join(dirname(cli), 'parsing/quintParserFrontend.js'));
const { newIdGenerator } = require(join(dirname(cli), 'idGenerator.js'));
const cases = generateCases();
const digest = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
assert.equal(cases.length, 5042, 'Unexpected audit matrix size');
assert.equal(digest, 'd372ca7a9e2353e8c910d63ab3427728abdf890230cccc2afcc37a2a10b8fae3',
  'Audit matrix changed: review coverage and update its fingerprint deliberately');
const parent = resolve(process.env.QUINT_AUDIT_ARTIFACTS ?? tmpdir());
mkdirSync(parent, { recursive: true });
const scratch = mkdtempSync(join(parent, 'quint-033-'));
const accepted = join(scratch, 'accepted');
const rejected = join(scratch, 'rejected');
mkdirSync(accepted);
mkdirSync(rejected);
let acceptedCount = 0;
let succeeded = false;
try {
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
  const summary = { reference: version, cases: cases.length, accepted: acceptedCount,
    rejected: cases.length - acceptedCount, sha256: digest,
    families: Object.fromEntries([...new Set(cases.map(c => c.family))].map(family =>
      [family, cases.filter(c => c.family === family).length])) };
  writeFileSync(join(scratch, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  let failed = false;
  for (const [layer, inputs] of [
    ['syntax-acceptance', [accepted, rejected]],
    ['parse-structure', [accepted]],
    ['tokenization', [accepted]],
  ]) {
    const script = join(root, `scripts/check-${layer}-parity.mjs`);
    const result = spawnSync(process.execPath, [script, '--quiet', ...inputs], {
      cwd: root, env: { ...process.env, QUINT_CLI: cli }, encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? '\n' + result.error.stack : ''}`;
    writeFileSync(join(scratch, `${layer}.log`), log);
    console.log(log.trim());
    if (result.status !== 0 || result.error) failed = true;
  }
  assert(!failed, 'Differential audit failed; see the retained checker logs');
  succeeded = true;
  console.log(`Quint ${version} audit passed: ${cases.length} cases (${acceptedCount} accepted, ${cases.length - acceptedCount} rejected); sha256 ${digest}`);
} finally {
  if (succeeded) rmSync(scratch, { recursive: true, force: true });
  else console.error(`Audit sources and logs retained at ${scratch}\nReproduce a case with QUINT_CLI=${cli} node scripts/check-syntax-acceptance-parity.mjs <case.qnt>`);
}
