// A late extra unit changes whether the first () belongs to the innermost
// header. Increasing the nesting depth moves that deciding token farther away.
export function generateLocalHeaderCases() {
  const cases = [];
  for (const depth of [1, 2, 8, 32, 128]) {
    for (const qualifier of ['val', 'pure val', 'def', 'pure def', 'action', 'nondet', 'temporal', 'run']) {
      for (const extra of [0, 1]) {
        const expression = Array.from({length: depth - 1}, (_, i) => `val d${i} = `).join('')
          + `${qualifier} pending ` + '() '.repeat(depth + extra);
        cases.push({name: `header-${depth}-${qualifier.replaceAll(' ', '-')}-${extra}.qnt`,
          depth, qualifier, extra, source: `module Header { pure def result = { ${expression} } }\n`});
      }
    }
  }
  return cases;
}
