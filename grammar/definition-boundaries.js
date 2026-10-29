// Preserve the reference parser's definition boundaries through hidden scanner
// markers. These do not add nodes or fields to the public syntax tree.
const SHARED_LEXICAL_RULES = new Set([
  "identifier", "integer_literal", "boolean_literal", "string_literal", "hole",
  "comment", "documentation_comment", "hashbang", "reserved_operator",
  "type_variable", "primitive_type", "invalid_identifier",
  "_division", "_nul_string_literal", "_nul_comment", "_nul_documentation_comment", "_nul_hashbang",
]);
export const recoverySymbols = $ => new Proxy($, {
  get: (symbols, name) => symbols[SHARED_LEXICAL_RULES.has(name) ? name : `_recovery_${name}`],
});

export function withDefinitionBoundaries(rules) {
  const recoveryRules = Object.fromEntries(Object.entries(rules)
    .filter(([name]) => name !== "source_file" && !SHARED_LEXICAL_RULES.has(name))
    .map(([name, rule]) => [`_recovery_${name}`, $ => recover(rule(recoverySymbols($)), $)]));
  function recover(content, $) {
    if (!content || typeof content !== "object" || content instanceof RegExp) return content;
    if (content.type === "SYMBOL" && content.name.startsWith("_recovery_")) {
      const name = content.name.slice(10);
      if (!name.startsWith("_")) return alias(content, $[name]);
    }
    if (Array.isArray(content)) return content.map(value => recover(value, $));
    return Object.fromEntries(Object.entries(content).map(([key, value]) => [key,
      key === "value" && content.type === "ALIAS" && typeof value === "string" && value.startsWith("_recovery_")
        ? value.slice(10) : recover(value, $)]));
  }
  const guarded = Object.fromEntries(Object.entries(rules).map(([name, rule]) => [name, $ => {
    function mark(content) {
      if (!content || typeof content !== "object" || content instanceof RegExp) return content;
      if (content.type === "ALIAS" && ["value_definition", "operator_definition"].includes(content.value)) {
        return seq($._begin_definition, content, $._end_definition);
      }
      if (content.type === "SYMBOL" && ["nondet_binding", "value_definition", "operator_definition"].includes(content.name)) {
        return seq($._begin_definition, content, $._end_definition);
      }
      if (Array.isArray(content)) return content.map(mark);
      return Object.fromEntries(Object.entries(content).map(([key, value]) => [key, mark(value)]));
    }
    const content = rule($);
    if (name === "source_file") return choice(
      seq($._reference_boundaries, content),
      seq($._recovery_boundaries, recover(rule(recoverySymbols($)), $)),
    );
    if (name === "module_definition") {
      // Only the guarded path has declaration markers.
      function declarations(node) {
        if (node?.type === "SYMBOL" && node.name === "_declaration") {
          return seq($._begin_declaration, node, $._end_declaration);
        }
        if (!node || typeof node !== "object" || node instanceof RegExp) return node;
        if (Array.isArray(node)) return node.map(declarations);
        return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, declarations(value)]));
      }
      return declarations(content);
    }
    return name === "_declaration" ? content : mark(content);
  }]));
  return {...guarded, ...recoveryRules};
}
