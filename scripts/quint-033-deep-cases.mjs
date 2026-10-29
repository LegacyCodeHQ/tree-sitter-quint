// Deeper expression combinations discovered during the Quint 0.33 audit.
// Fixed xorshift32 seeds keep failures reproducible across machines and runs.
export function generateDeepCases(batches = [[0x3311001, 6000], [0x3311002, 10000], [0x3311003, 10000],
  [0x33ab001, 10000], [0x33ab002, 10000]]) {
  const cases = [];
  for (const [seed, count] of batches) {
    let state = seed;
    const pick=a=>{state^=state<<13;state^=state>>>17;state^=state<<5;return a[(state>>>0)%a.length]};
    const operators=['^','*','/','%','+','-','>','<','>=','<=','!=','==','and','or','iff','leadsTo','implies','->'];
    const qualifiers=['val local','pure val local','def local()','def local(p)','pure def local()','action local','run local','nondet local','temporal local'];
    function expression(depth) {
     if(!depth)return pick(['x','y','1','true','"😀"','"\u0000"','Scope::x','List','as','from','0xAf_12']);
     const e=()=>expression(depth-1);
     switch(pick(Array.from({length:23},(_,i)=>i))) {
     case 0:case 1:return `${e()} ${pick(operators)} ${e()}`;
     case 2:return `-${e()}`;
     case 3:return `if (${e()}) ${e()} else ${e()}`;
     case 4:case 5:return `${pick(qualifiers)} = ${e()}${pick(['',';'])}\n${e()}`;
     case 6:return `(${e()}, ${e()})`;
     case 7:return `[${e()}, ${e()}${pick(['',','])}]`;
     case 8:return `{a: ${e()}, ...${e()}}`;
     case 9:return `match ${e()} { ${pick(['','|'])} A(p) => ${e()} | _ => ${e()} }`;
     case 10:return `f(${e()}${pick(['',','])})`;
     case 11:return `${e()}.${pick(['map','and','or','Scope::op'])}(${e()})`;
     case 12:return `(${e()})[${e()}]`;
     case 13:return `p => ${e()}`;
     case 14:return `${pick(['all','any','and','or'])} { ${e()}, ${e()}${pick(['',','])} }`;
     case 15:return `x' = ${e()}`;
     case 16:return `{ ${e()} }`;
     case 17:return `(${e()})`;
     case 18:return `val (a,b) = ${e()}${pick(['',';'])}\n${e()}`;
     case 19:return `val {a,b} = ${e()}${pick(['',';'])}\n${e()}`;
     case 20:return `${pick(['(p,q)','((p,q))','_','(Scope::p,_)'])} => ${e()}`;
     case 21:return `${e()}.${pick(['a','Scope::b','from','or'])}`;
     default:return `def local(p: int): int = ${e()}${pick(['',';'])}\n${e()}`;
     }
    }

    for (let i = 0; i < count; i++) {
      cases.push({
        family: 'deep-expression',
        name: `deep-${seed.toString(16)}-${String(i).padStart(5, '0')}.qnt`,
        source: `module Probe { pure def result = ${expression(2 + i % 4)} }\n`,
      });
    }
  }
  return cases;
}
