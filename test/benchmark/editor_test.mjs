import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
test('editor benchmarks interleave distinct documents without validation warming timed turns', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'quint-editor-test-'));
  try {
    const output = path.join(temporary, 'report.json');
    const run = spawnSync(process.execPath, ['scripts/benchmark-editor.mjs', '--baseline-binding',
      'build/Release/tree_sitter_quint_binding.node', '--documents', '2,4,10', '--definitions', '3',
      '--rounds', '1', '--output', output], {cwd: root, encoding: 'utf8', timeout: 20000});
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.schema, 1);
    assert.equal(report.diagnosticOnly, false);
    assert.equal(report.validationOrder, 'after-timed-sequence');
    assert.equal(report.treeValidation, 'full');
    assert.equal(report.measurements.length, 6);
    assert.match(report.workerSha256, /^[a-f0-9]{64}$/);
    for (const input of report.inputs) {
      assert.equal(new Set(input.sources.map(x => x.sha256)).size, input.documents);
      // Different declaration counts ensure different kind streams, not just names.
      assert.equal(new Set(input.sources.map(x => x.definitions)).size, input.documents);
      for (const version of ['baseline', 'candidate']) {
        const result = report.measurements.find(x => x.documents === input.documents && x.version === version);
        assert.equal(result.turns.length, input.documents * 11);
        assert.equal(result.validationParses, result.turns.length);
        assert.equal(result.timedEventLoopYields, result.turns.length);
        assert.equal(result.eventLoopYields, result.turns.length*2);
        assert(result.maxRssKiB > 0);
        assert.equal(result.edits.p50Ms, result.edits.samples.slice().sort((a,b)=>a-b)[Math.ceil(result.edits.samples.length * .5)-1]);
        assert.equal(result.edits.p95Ms, result.edits.samples.slice().sort((a,b)=>a-b)[Math.ceil(result.edits.samples.length * .95)-1]);
        for (const label of ['rename','literal','operator','semicolon','brace']) {
          assert.equal(result.turns.filter(t => t.label === label).length, input.documents);
          assert.equal(result.turns.filter(t => t.label === `${label}:undo`).length, input.documents);
        }
        for (let i = 0; i < result.turns.length; i++) {
          const turn = result.turns[i];
          assert.equal(turn.document, i % input.documents);
          assert.equal(turn.hasError, turn.label === 'brace');
          assert.match(turn.digest, /^[a-f0-9]{64}$/);
        }
      }
    }
  } finally { rmSync(temporary, {recursive:true, force:true}); }
});
