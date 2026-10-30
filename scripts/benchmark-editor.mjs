import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import Parser from 'tree-sitter';
import {editorSources, editorTurns} from './editor-benchmark-cases.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name)+1] : fallback;
const hash = value => createHash('sha256').update(value).digest('hex');
const quantiles = samples => {
  const sorted = samples.slice().sort((a,b)=>a-b);
  return {samples, p50Ms: sorted[Math.ceil(sorted.length*.5)-1], p95Ms: sorted[Math.ceil(sorted.length*.95)-1]};
};
function capture(tree) {
  const rows = [], pending = [[tree.rootNode, null]];
  while (pending.length) {
    const [node, field] = pending.pop();
    rows.push([node.type, field, node.isNamed, node.isMissing, node.hasError,
      node.startIndex, node.endIndex, node.startPosition, node.endPosition, node.childCount]);
    for (let i=node.childCount-1;i>=0;i--) pending.push([node.child(i), node.fieldNameForChild(i)]);
  }
  return hash(JSON.stringify(rows));
}
function edit(tree, current, next) {
  let start = 0, oldEnd = current.length, newEnd = next.length;
  while(start<oldEnd && start<newEnd && current[start]===next[start]) start++;
  while(oldEnd>start && newEnd>start && current[oldEnd-1]===next[newEnd-1]) {oldEnd--;newEnd--;}
  const point = (source, offset) => {const lines=source.slice(0,offset).split('\n');return {row:lines.length-1,column:lines.at(-1).length};};
  tree.edit({startIndex:start, oldEndIndex:oldEnd, newEndIndex:newEnd,
    startPosition:point(current,start), oldEndPosition:point(current,oldEnd), newEndPosition:point(next,newEnd)});
}
if (args.includes('--worker')) {
  const binding = createRequire(import.meta.url)(path.resolve(option('--binding')));
  const sources = JSON.parse(readFileSync(option('--input'), 'utf8'));
  const documents = sources.map(() => {const parser = new Parser();parser.setLanguage(binding);return {parser, tree:null, source:''};});
  const schedule = editorTurns(sources), turns = [];
  for (const turn of schedule) {
    const doc = documents[turn.document];
    if (doc.tree) edit(doc.tree, doc.source, turn.source);
    const start = performance.now();
    doc.tree = doc.parser.parse(turn.source, doc.tree);
    const elapsedMs = performance.now()-start;
    doc.source = turn.source;
    turns.push({document: turn.document, label:turn.label, elapsedMs,
      sourceSha256:hash(turn.source), hasError:doc.tree.rootNode.hasError, digest:capture(doc.tree)});
    assert.equal(doc.tree.rootNode.hasError, turn.label === 'brace');
    await new Promise(setImmediate);
  }
  // Validate only AFTER all timed turns: a fresh parse between turns would
  // populate the same global cache and conceal cross-document eviction.
  for (let i=0;i<schedule.length;i++) {
    const parser = new Parser();parser.setLanguage(binding);
    assert.equal(capture(parser.parse(schedule[i].source)), turns[i].digest, 'incremental tree differs from fresh parse');
    await new Promise(setImmediate);
  }
  const edits = turns.filter(t=>t.label!=='initial').map(t=>t.elapsedMs);
  console.log(JSON.stringify({diagnosticOnly:false, treeValidation:'full', validationOrder:'after-timed-sequence',
    timedEventLoopYields:turns.length, eventLoopYields:turns.length*2, validationParses:turns.length, turns, edits:quantiles(edits),
    maxRssKiB:process.resourceUsage().maxRSS, processCpuMicros:process.resourceUsage().userCPUTime+process.resourceUsage().systemCPUTime}));
} else {
  const output = option('--output'), baseline = option('--baseline-binding'), candidate = option('--candidate-binding', 'build/Release/tree_sitter_quint_binding.node');
  const rounds = Number(option('--rounds','5')), definitions = Number(option('--definitions','512'));
  const counts = option('--documents','1,2,4,10').split(',').map(Number);
  assert(output && baseline, 'usage: benchmark-editor.mjs --baseline-binding FILE --output FILE [--documents 1,2,4,10] [--definitions 512] [--rounds 5]');
  assert(Number.isInteger(rounds)&&rounds>0 && Number.isInteger(definitions)&&definitions>0);
  assert(counts.length && counts.every(x=>Number.isInteger(x)&&x>0&&x<=64) && new Set(counts).size===counts.length);
  assert(!existsSync(output), `Output already exists: ${output}`);
  const worker = fileURLToPath(import.meta.url), cases = fileURLToPath(new URL('./editor-benchmark-cases.mjs', import.meta.url));
  const report = {schema:1, diagnosticOnly:false, treeValidation:'full', validationOrder:'after-timed-sequence',
    scheduling:'round-robin-documents-yield-between-parses', peakRssScope:'full-validation-worker', inputDelivery:'file',
    node:process.version, platform:`${process.platform}/${process.arch}`, cpu:os.cpus()[0]?.model,
    workerSha256:hash(readFileSync(worker)), casesSha256:hash(readFileSync(cases)), bindings:{}, rounds, definitions, inputs:[], measurements:[]};
  for (const [version,file] of Object.entries({baseline,candidate})) report.bindings[version]={path:path.resolve(file),sha256:hash(readFileSync(file))};
  const temporary = mkdtempSync(path.join(os.tmpdir(),'quint-editor-'));
  try {
    for (const documents of counts) {
      const sources=editorSources(documents,definitions), input=path.join(temporary,'input.json');
      writeFileSync(input,JSON.stringify(sources));
      const inputHash=hash(readFileSync(input));
      report.inputs.push({documents,sources:sources.map(s=>({document:s.document,definitions:s.definitions,bytes:Buffer.byteLength(s.source),sha256:hash(s.source)}))});
      let expected;
      for(let round=0;round<rounds;round++) {
        for(const version of round%2?['candidate','baseline']:['baseline','candidate']) {
          const run=spawnSync(process.execPath,[worker,'--worker','--binding',report.bindings[version].path,'--input',input],{encoding:'utf8',timeout:120000});
          if(run.status!==0||run.stderr) report.failure={documents,round,version,status:run.status,signal:run.signal,error:run.error?.message,stdout:run.stdout,stderr:run.stderr};
          assert.equal(run.status,0,run.stderr||run.error?.message);assert.equal(run.stderr,'');
          const result=JSON.parse(run.stdout);
          const outputs=result.turns.map(({elapsedMs,...turn})=>turn);
          expected??=outputs;assert.deepEqual(outputs,expected,'baseline/candidate output mismatch');
          assert.equal(result.validationOrder,report.validationOrder);assert.equal(result.treeValidation,'full');assert.equal(result.diagnosticOnly,false);
          report.measurements.push({documents,round,version,...result});
          assert.equal(hash(readFileSync(report.bindings[version].path)),report.bindings[version].sha256,'Binding changed');
          assert.equal(hash(readFileSync(input)),inputHash,'Input changed');
          assert.equal(hash(readFileSync(worker)),report.workerSha256,'Worker changed');
          assert.equal(hash(readFileSync(cases)),report.casesSha256,'Cases changed');
        }
      }
      console.error(`matched ${documents} interleaved documents`);
    }
  } catch(error) {report.error=error.stack;throw error;}
  finally {rmSync(temporary,{recursive:true,force:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  const median=x=>x.sort((a,b)=>a-b)[x.length>>1];
  for(const documents of counts) {
    const summary={documents};
    for(const version of ['baseline','candidate']) {const rows=report.measurements.filter(r=>r.documents===documents&&r.version===version);
      summary[version]={p50Ms:median(rows.map(r=>r.edits.p50Ms)),p95Ms:median(rows.map(r=>r.edits.p95Ms)),maxRssKiB:median(rows.map(r=>r.maxRssKiB))};}
    console.log(JSON.stringify(summary));
  }
}
