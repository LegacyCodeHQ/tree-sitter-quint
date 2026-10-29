// ANTLR boundary coverage for names, declarations, literals, and comments.
// Bind row/type variables so semantic scope errors do not masquerade as syntax gaps.
export function generateAdditionalCases() {
  const cases = [];
  const emit = (family, body, raw = false) => cases.push({
    name: `extra-${String(cases.length + 1).padStart(5, '0')}-${family}.qnt`,
    family, source: raw ? body : `module Probe {\n${body}\n}\n`,
  });
  const names = ['x', 'X', '_x', '__', 'as', 'from', 'Set', 'List', 'Scope::x', 'from::as', 'List::Set'];
  for (const name of names) {
    emit('module-name', `module ${name} { pure val value = 1 }\n`, true);
    for (const other of ['x','as','from','Set','Scope::x']) {
      for (const source of ['', ' from "./dependency"']) {
        emit('module-import', `import ${name} as ${other}${source}`);
        emit('named-import', `import ${name}.${other}${source}`);
        emit('instance-import', `import ${name}(${other} = 1,) as Scope::Alias${source}`);
        emit('instance-wildcard', `import ${name}(${other} = 1). *${source}`);
      }
      emit('module-export', `export ${name} as ${other}`);
      emit('named-export', `export ${name}.${other}`);
    }
    emit('wildcard-export', `export ${name}.*`);
    emit('wildcard-import', `import ${name}.* from "./dependency"`);
    for (const template of [n=>`const ${n}: int`, n=>`var ${n}: int`, n=>`assume ${n} = true`, n=>`pure val ${n} = 1`, n=>`pure def f(${n}): int = 1`, n=>`pure val f = ${n} => 1`, n=>`pure val f = ${n}' = 1`, n=>`pure val f = source.${n}(1)`, n=>`pure val f = source.${n}`, n=>`pure val f = ${n}(1,)`])
      emit('identifier-context', template(name));
    for (const payload of ['', '(int)', '((int, bool))', '({x: int})', '(int -> bool)'])
      for (const lead of ['', '|'])
        emit('sum-label', `type T = ${lead}${name}${payload} | Other`);
    for (const context of [n=>`pure val f = { ${n}: 1 }`, n=>`const f: { ${n}: int }`, n=>`pure val f = match A { ${n}(x) => x | _ => 0 }`, n=>`val {${n}} = {x: 1}`])
      emit('simple-identifier', context(name));
  }
  const literals = ['0','1','10','1_000','0x0','0xAb_Cd','0_1','00','0XAB','0x','1_','1__2','0x_1','0x1_','""','"plain"','"\\n"','"line\nnext"','"carriage\rreturn"','"tab\there"','"café"','"λ"','"😀"','"\u0000"','"\u2028"','"unterminated\u0000'];
  for (const literal of literals)
    for (const form of [x=>`pure val f = ${x}`, x=>`pure val f = [${x},]`, x=>`pure val f = (${x}, 1)`, x=>`pure val f = { field: ${x} }`, x=>`pure val f = call(${x},)`, x=>`pure val f = { val local = ${x}; local }`])
      emit('literal-boundary', form(literal));
  for (const comment of ['/*c*/','/**/','/***/','/* a /* b */','// c\n','// c\r\n','// c\r x\n','/* 😀 */','/*\u0000*/','/*\u0000'])
    for (const body of ['pure val f = 4 / 2','import Source as Alias from "./source"','type T[a] = | Some(a) | None','pure val f = { val x = 1; x + 2 }','pure def f(x: int): int = x'])
      emit('comment-boundary', body.match(/"[^"]*"|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]/g).join(comment));
  for (const prefix of ['', '/// docs\n','/// docs\r\n','// regular\n','/* block */\n'])
    for (const between of ['', '/// docs\n','// regular\n','/* block */\n'])
      for (const suffix of ['', '// end\n','/* end */'])
        emit('module-docs', `${prefix}module A { ${between}pure val f = 1 }\n${prefix}module B { }\n${suffix}`, true);
  for (const params of ['a,r','a,b,r','as','from','_a,a,r','Scope::a','A','a,'])
    for (const type of ['{x: a | r}','{x: int,}','{|r}','List[a]','Scope::T[a]','Set[int]','T()','T[int,]','Map[int, bool]'])
      emit('type-head-row', `type T[${params}] = ${type}`);
  return cases;
}
