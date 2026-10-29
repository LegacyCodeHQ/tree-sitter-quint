// Operator cross-products, initializer boundaries, and a fixed xorshift32 seed.
// Record cases use at most one spread: QNT012 is a frontend validation rule,
// while the ANTLR grammar intentionally accepts repeated recElem spreads.
export function generateExpressionCases() {
  const cases = [];
  const emit = (family, expr) => cases.push({name: `expr-${String(cases.length + 1).padStart(5, '0')}-${family}.qnt`, family, source: `module Probe { pure def result = ${expr} }\n`});
  const operators = ['^','*','/','%','+','-','>','<','>=','<=','!=','==','and','or','iff','leadsTo','implies','->'];
  for (const first of operators) for (const second of operators)
    for (const context of [x=>x, x=>`{ val local = ${x}; local }`, x=>`if (true) 0 else ${x}`])
      emit('operator-precedence', context(`x ${first} y ${second} z`));
  const atoms = ['1', 'x', 'List(1)', '[1,2]', '(1,2)', '{a: 1}', 'if (true) x else y', 'match A { A => x | _ => y }', 'p => p', 'val local = x local', "x' = y"];
  for (const atom of atoms) for (const form of [x=>`{ ...${x}, a: 1 }`, x=>`{ a: 1, ...${x} }`, x=>`{ ...${x} }`])
    emit('record-spread',form(atom));
  const bodies = ['(x,y)', '-x', '[1]', 'x + y', 'p => p', 'val next = 1 next', 'x[0]', '{a: 1}', 'match A { A => x }', 'if (true) x else y'];
  for (const init of [...atoms, 'and {true,false}', 'or {true,false}'])
    for (const body of bodies) for (const qualifier of ['val local','def local()','nondet local'])
      for (const semi of ['', ';'])
        emit('initializer-composition', `{ ${qualifier} = ${init}${semi}\n${body} }`);
  let state = 0x0332026;
  const pick = values => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return values[(state >>> 0) % values.length]; };
  function expr(depth) {
    if (!depth) return pick(['x','y','1','true','"😀"','"\u0000"']);
    const e = () => expr(depth - 1);
    switch (pick([0,1,2,3,4,5,6,7,8,9,10,11])) {
      case 0: return `${e()} ${pick(operators)} ${e()}`;
      case 1: return `-${e()}`;
      case 2: return `if (${e()}) ${e()} else ${e()}`;
      case 3: return `val local = ${e()}${pick(['',';'])}\n${e()}`;
      case 4: return `def local() = ${e()}${pick(['',';'])}\n${e()}`;
      case 5: return `(${e()}, ${e()})`;
      case 6: return `[${e()}, ${e()}]`;
      case 7: return `{a: ${e()}, ...${e()}}`;
      case 8: return `match ${e()} { A(p) => ${e()} | _ => ${e()} }`;
      case 9: return `f(${e()}).map(p => ${e()})`;
      case 10: return `(${e()})[${e()}]`;
      default: return `p => ${e()}`;
    }
  }
  for (let i=0;i<1000;i++) emit('seeded-expression',expr(2 + i % 3));
  for (const qualifier of ['val saved', 'def earlier()'])
    for (const header of ['def later()', 'def later(p)', 'pure def later()', 'def later(p: int): int', 'def later', 'pure def later'])
      for (const initializer of ['x', 'x - y', "x' = y", '[1]', '{a: 1}', 'f(1)'])
        for (const semi of ['', ';'])
          for (const sep of ['\n', ' /* boundary */\n', '\n// boundary\n'])
            emit('minus-local-definition', `{ ${qualifier} = ${initializer}${semi}${sep}-${header} = x\nx }`);
  return cases;
}
