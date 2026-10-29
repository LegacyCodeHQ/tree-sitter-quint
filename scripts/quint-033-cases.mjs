import { generateAdditionalCases } from "./quint-033-lexical-cases.mjs";

// Deterministic boundary matrices from the 0.33 compatibility investigation.
export function generateCases() {
  const cases = [];
  const emit = (family, body, raw = false) => cases.push({
    name: `${String(cases.length + 1).padStart(5, "0")}-${family}.qnt`,
    family, source: raw ? body : `module Probe {\n${body}\n}\n`,
  });
  for (const qualifier of ['val','pure val','def','pure def','action','temporal','run','nondet'])
    for (const params of ['', '()', '(x)', '(x,)', '(x: int)', '(x: int,)'])
      for (const ret of ['', ': int'])
        for (const end of ['', ';', '= 1', '= 1;']) {
          emit('header', `${qualifier} f${params}${ret}${end}`);
          emit('local-header', `pure def outer = { ${qualifier} f${params}${ret}${end}\nf }`);
        }
  for (const sep of ['\n','\r','\r\n','\n// comment\n','\n/* comment */','/* comment */\n','\n/* comment\n */','\n\n','\n/// doc\n'])
    for (const expr of ['List(1)', '(1 + 2)', 'List(1).map(x => x + 1)', 'if (true) List(1) else List(2)'])
      for (const continuation of ['.map(x => x + 1)', '[0]'])
        emit('continuation', `pure def f = { val xs = ${expr}${sep}${continuation}\nxs }`);
  for (const sep of [' ', '/* c */','\n','// c\n','\r\n','/*\n*/'])
    for (const body of ['pure val x() = 1', 'type T[a] = A(a) | B', 'import M(N = 1) as K', 'pure def f(x: int): int = x + 1', "var x: int action a = x' = 1"])
      emit('token-separators', body.match(/[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]/g).join(sep));
  for (const a of ['int','a','T','()','(int, bool)','{x: int}','{|r}','(int)','int -> bool','int => bool','() => bool','(int,bool) => str'])
    for (const b of [`List[${a}]`,`Set[${a}]`,`{f: ${a}}`,`(${a})`,`(${a}, bool)`,`(${a}, bool) => str`,`(${a}) => str`])
      for (const op of [' -> ', ' => '])
        for (const c of ['int','() => bool','(int,bool) => str','int -> bool','int => bool'])
          emit('nested-type', `const f: ${b}${op}${c}`);
  for (const expr of ['A','if (true) A else B','val x = A x','match A {A => A}','a => A','{x: A}', 'A -> B'])
    for (const arms of ['_ => 1','A => 1 | _ => 0','A(x) => x','A(_) => 1','A(Scope::x) => 1','Scope::A(x) => x'])
      emit('match', `pure val v = match ${expr} { ${arms} }`);
  for (const params of ['x','_','(x)','(x,y)','((x,y))','(x,)','((x,y,))','(x: int)','()', '(_,_ )','(Scope::x, Scope::y)'])
    for (const body of ['1','1 -> 2','x => x','match A { A => 1 }','val y = 1 y'])
      emit('lambda', `pure def f = ${params} => ${body}`);
  for (const header of ['def f','pure def f','def f(x)','pure def f(x: int): int','action f','temporal f','run f','nondet f','val f(x)','pure val f(x)','val f: int','val (f,g)','val {f}'])
    for (const init of ['x','1','List(1)','x + y','x - y','if (true) x else y','x => x','{ x }','val y = x y','x[0]','x.foo()'])
      for (const body of ['(x,y)','-x','[1]','x + y','x => x','val z = 1 z','x[0]'])
        for (const sep of ['\n',';\n'])
          emit('local-boundary', `pure def outer = { ${header} = ${init}${sep}${body} }`);
  for (const arity of [0,1,2,3])
    for (const semi of ['', ';'])
      for (const sep of ['\n',' /* boundary */\n','\n// boundary\n'])
        emit('nested-call', `module V { pure val source = true pure def result = {\nval outer = val inner = def local() = source${semi}${sep}(${Array(arity).fill('true').join(', ')})\nall {true, false}\ndef later() = true\ntrue\n} }\n`, true);
  for (const depth of [1,2,3,4])
    for (const semi of ['', ';'])
      for (const sep of ['\n',' /* boundary */\n','\n// boundary\n'])
        emit('assignment-chain', `module V { var x: int pure val y = 1 pure def result = {\ndef first() = { val local = {a: 1} () }${semi}${sep}-x' = ${'y - '.repeat(depth)}def later() = {a: 1}\n(1, 2)\n} }\n`, true);
  return [...cases, ...generateAdditionalCases()];
}
