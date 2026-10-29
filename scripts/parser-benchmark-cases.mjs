export function definitionInput(count, { identical = false, incomplete = false } = {}) {
  return {
    name: `${identical ? "identical-definitions" : incomplete ? "incomplete-definitions" : "definitions"}-${count}`,
    referenceAccepted: !incomplete,
    source: "module Benchmark {\n" + Array.from({ length: count }, (_, i) =>
      identical ? "pure val same = 1 + 1\n" : `pure val value${i} = ${i} + 1\n`).join("") +
      (incomplete ? "pure val unfinished =\n" : "}\n"),
  };
}
export function benchmarkInputs(scaling = false) {
  const inputs = [32, 128, 512].map(count => definitionInput(count));
  inputs.push({ name: "repeated-unicode-comments", referenceAccepted: true,
    source: "module Repeated {\n" + Array.from({ length: 128 }, (_, i) =>
      `/* \u03bb \ud83c\udf33 */ pure def value${i} = { val same = 1; same }\n`).join("") + "}\n" });
  if (scaling) {
    inputs.push(definitionInput(1024), definitionInput(4096), definitionInput(256, { identical: true }),
      { ...definitionInput(1024, { identical: true }), stress: true },
      definitionInput(1024, { incomplete: true }));
    for (const depth of [16, 64]) {
      let body = "1";
      for (let i = 0; i < depth; i++) body = `{ val local${i} = ${body}; local${i} }`;
      inputs.push({ name: `nested-locals-${depth}`, referenceAccepted: true,
        source: `module Nested { pure def result = ${body} }\n` });
    }
    for (const bytes of [65536, 262144]) {
      inputs.push({ name: `comment-${bytes}`, referenceAccepted: true,
        source: "/*" + "x".repeat(bytes) + "*/\nmodule Comment { pure val value = 1 + 1 }\n" });
    }
    inputs.push({ name: "unterminated-comment-65536", referenceAccepted: false,
      source: "module Unfinished { pure val value = 1 /*" + "x".repeat(65536) });
  }
  return inputs;
}
