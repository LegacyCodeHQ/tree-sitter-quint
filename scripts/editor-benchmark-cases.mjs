import {definitionInput} from './parser-benchmark-cases.mjs';

export function editorSources(documents, definitions) {
  return Array.from({length: documents}, (_, document) => ({document, definitions: definitions + document,
    source: definitionInput(definitions + document).source.replace('module Benchmark', `module Editor${document}`)}));
}
export function editorTurns(sources) {
  const turns = sources.map(({document, source}) => ({document, label: 'initial', source}));
  const changes = {
    rename: source => source.replace(/module (\w+)/, 'module $1Edited'),
    literal: source => source.replace('= 0 + 1', '= 2 + 1'),
    operator: source => source.replace('+ 1', '- 1'),
    semicolon: source => source.replace('+ 1\n', '+ 1;\n'),
    brace: source => source.replace(/}\n$/, '\n'),
  };
  for (const [label, change] of Object.entries(changes)) {
    for (const undo of [false, true]) {
      for (const {document, source} of sources) {
        const next = undo ? source : change(source);
        if (!undo && next === source) throw new Error(`${label} did not edit document ${document}`);
        turns.push({document, label: `${label}${undo ? ':undo' : ''}`, source: next});
      }
    }
  }
  return turns;
}
