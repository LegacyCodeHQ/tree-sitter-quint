// Every ordered binary-operator pair through the two local-body paths whose
// continuation preferences previously overrode static operator precedence.
export function generateLocalBodyCases() {
  const operators = ['^', '*', '/', '%', '+', '-', '>', '<', '>=', '<=',
    '!=', '==', 'and', 'or', 'iff', 'leadsTo', 'implies', '->'];
  const cases = [];
  for (const first of operators) {
    for (const second of operators) {
      for (const context of ['header', 'parenthesized']) {
        const expression = context === 'header'
          ? `val saved = val middle = val pending\nseed\nseed ${first} seed ${second} seed\nseed`
          : `def previous = val saved = recordValue.a\n(seed) ${first} seed ${second} seed\nseed`;
        cases.push({
          family: 'local-body-operator-pair',
          name: `body-${String(cases.length).padStart(4, '0')}-${context}.qnt`,
          source: `module Probe { pure val seed = 1\npure val recordValue = {a: 1}\npure def result = ${expression}\n}\n`,
        });
      }
    }
  }
  return cases;
}
