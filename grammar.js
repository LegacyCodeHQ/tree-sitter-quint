/**
 * @file Tree-sitter grammar for Quint
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license Apache-2.0
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

import { recoverySymbols, withDefinitionBoundaries } from "./grammar/definition-boundaries.js";

const PREC = {
  DEFINITION_HEAD: 1,
  BLOCK_BINDING: 2,
  // Bodies extend through a pair; right associativity keeps the pair inside.
  BODY: 0,
  PAIR: 0,
  IMPLICATION: 2,
  LEADS_TO: 3,
  EQUIVALENCE: 4,
  DISJUNCTION: 5,
  CONJUNCTION: 6,
  INVALID_EQUALITY: 7,
  ASSIGNMENT: 8,
  RELATION: 9,
  ADDITIVE: 10,
  MULTIPLICATIVE: 11,
  UNARY: 12,
  POWER: 13,
  POSTFIX: 14,
};

const RESERVED_IDENTIFIERS = [
  "action",
  "all",
  "and",
  "any",
  "assume",
  "bool",
  "const",
  "def",
  "else",
  "export",
  "false",
  "if",
  "iff",
  "implies",
  "import",
  "int",
  "leadsTo",
  "match",
  "module",
  "nondet",
  "or",
  "pure",
  "run",
  "str",
  "temporal",
  "true",
  "type",
  "val",
  "var",
];

const IDENTIFIER_TAIL_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";

function identifierPatternWithout(reservedWords, includeUppercase = true) {
  const root = { terminal: false, children: new Map() };

  for (const word of reservedWords) {
    let node = root;
    for (const character of word) {
      if (!node.children.has(character)) {
        node.children.set(character, { terminal: false, children: new Map() });
      }
      node = node.children.get(character);
    }
    node.terminal = true;
  }

  const alternatives = includeUppercase
    ? ["[A-Z][A-Za-z0-9_]*", "_[A-Za-z0-9_]+"]
    : ["_[A-Za-z0-9_]+"];

  function addAlternatives(node, prefix) {
    if (prefix && !node.terminal) {
      alternatives.push(prefix);
    }

    const alphabet = prefix
      ? IDENTIFIER_TAIL_CHARACTERS
      : "abcdefghijklmnopqrstuvwxyz";
    const childCharacters = new Set(node.children.keys());
    const remainingCharacters = [...alphabet]
      .filter(character => !childCharacters.has(character))
      .join("");

    if (remainingCharacters) {
      alternatives.push(
        `${prefix}[${remainingCharacters}][A-Za-z0-9_]*`,
      );
    }

    for (const [character, child] of node.children) {
      addAlternatives(child, prefix + character);
    }
  }

  addAlternatives(root, "");
  return new RegExp(`(?:${alternatives.join("|")})`);
}

const IDENTIFIER_PATTERN = identifierPatternWithout(RESERVED_IDENTIFIERS);
// Type variables correspond to ANTLR's LOW_ID, excluding every keyword token.
// `as` and `from` remain available as named types through `identifier`.
const TYPE_VARIABLE_PATTERN = identifierPatternWithout(
  [...RESERVED_IDENTIFIERS, "as", "from"],
  false,
);
const identifierOrHole = $ => choice(
  $.identifier,
  $.qualified_identifier,
  $.hole,
);

function binaryExpression($, expression) {
  return choice(
    prec.left(PREC.IMPLICATION, seq(
      field("left", expression),
      field("operator", "implies"),
      field("right", expression),
    )),
    prec.left(PREC.LEADS_TO, seq(
      field("left", expression),
      field("operator", "leadsTo"),
      field("right", expression),
    )),
    prec.left(PREC.EQUIVALENCE, seq(
      field("left", expression),
      field("operator", "iff"),
      field("right", expression),
    )),
    prec.left(PREC.DISJUNCTION, seq(
      field("left", expression),
      field("operator", "or"),
      field("right", expression),
    )),
    prec.left(PREC.CONJUNCTION, seq(
      field("left", expression),
      field("operator", "and"),
      field("right", expression),
    )),
    // ANTLR's relations alternative gives equality and ordering equal precedence.
    prec.left(PREC.RELATION, seq(
      field("left", expression),
      field("operator", choice("==", "!=", "<", "<=", ">", ">=")),
      field("right", expression),
    )),
    prec.left(PREC.ADDITIVE, seq(
      field("left", expression),
      field("operator", choice("+", "-")),
      field("right", expression),
    )),
    prec.left(PREC.MULTIPLICATIVE, seq(
      field("left", expression),
      field("operator", choice("*", alias($._division, "/"), "%")),
      field("right", expression),
    )),
    prec.right(PREC.POWER, seq(
      field("left", expression),
      field("operator", "^"),
      field("right", expression),
    )),
  );
}

function callExpression($, expression) {
  return prec.left(PREC.POSTFIX, seq(
    field("function", choice(
      $.name_reference,
      $.namespace_access_expression,
      $.reserved_operator,
    )),
    "(",
    optional(seq(
      field("argument", expression),
      repeat(seq(",", field("argument", expression))),
    )),
    optional(","),
    ")",
  ));
}

function ufcsCallExpression($, expression) {
  return prec.left(PREC.POSTFIX + 1, seq(
    field("receiver", expression),
    ".",
    field("method", choice(
      $.identifier,
      $.qualified_identifier,
      $.reserved_operator,
    )),
    "(",
    optional(seq(
      field("argument", expression),
      repeat(seq(",", field("argument", expression))),
    )),
    ")",
  ));
}

function indexExpression($, expression) {
  return prec.left(PREC.POSTFIX, seq(
    field("collection", expression),
    "[",
    field("index", expression),
    "]",
  ));
}

function fieldAccessExpression($, expression) {
  return prec.left(PREC.POSTFIX, seq(
    field("object", expression),
    ".",
    field("field", choice(
      $.identifier,
      $.qualified_identifier,
      $.reserved_operator,
    )),
  ));
}

function pairExpression($, expression) {
  return prec.left(PREC.PAIR, seq(
    field("left", expression),
    "->",
    field("right", expression),
  ));
}

// Share parameter lists and return annotations across definition qualifiers.
function operatorDefinitionHead($) {
  const parameters = parameter => seq(
    "(",
    field("parameter", parameter),
    repeat(seq(",", field("parameter", parameter))),
    optional(","),
    ")",
  );
  const nonemptyTail = choice(
    seq(parameters($.annotated_parameter), ":", field("return_type", $._type)),
    seq(parameters($.parameter), optional($._return_type_annotation)),
  );
  return prec.right(PREC.DEFINITION_HEAD, choice(
    // A nonempty parameter list makes a val an operator; val() remains a value.
    seq(
      optional(field("qualifier", "pure")),
      "val",
      field("name", $._normal_call_name),
      nonemptyTail,
    ),
    seq(
      choice(
        seq(optional(field("qualifier", "pure")), "def"),
        field("qualifier", choice("action", "nondet", "temporal", "run")),
      ),
      field("name", $._normal_call_name),
      optional(choice(
        nonemptyTail,
        seq("(", ")", optional($._return_type_annotation)),
        $._return_type_annotation,
      )),
    ),
  ));
}

export default grammar({
  name: "quint",

  word: $ => $.identifier,

  supertypes: $ => [
    $._declaration,
    $._expression,
    $._type,
    $._block_combinator_expression,
  ],

  externals: $ => [
    $._division,
    $._reference_boundaries,
    $._recovery_boundaries,
    $._begin_definition,
    $._end_definition,
    $._begin_declaration,
    $._end_declaration,
    $._nul_string_literal,
    $._nul_comment,
    $._nul_documentation_comment,
    $._nul_hashbang,
  ],

  extras: $ => [
    /[ \t\r\n]/,
    $.comment,
  ],

  conflicts: $ => {
    const shared = $ => [
      [$._parenthesized_operator_type, $.tuple_type],
      [$.lambda_expression, $.name_reference],
      [$.lambda_expression, $.tuple_pattern],
      [$.lambda_expression, $.tuple_pattern, $.name_reference],
      [$.namespace_access_expression, $.qualified_identifier],
    ];
    return [...shared($), ...shared(recoverySymbols($))];
  },

  rules: withDefinitionBoundaries({
    source_file: $ => seq(
      optional($.hashbang),
      repeat(choice($.documentation_comment, $.module_definition)),
      // An empty line comment at EOF remains useful in an editor buffer.
      optional(alias(token("//"), $.comment)),
    ),

    hashbang: $ => choice(
      $._nul_hashbang,
      token(seq("#!", /[^\n]*/, optional("\n"))),
    ),

    module_definition: $ => seq(
      "module",
      field("name", choice($.identifier, $.qualified_identifier)),
      "{",
      repeat(seq(repeat($.documentation_comment), $._declaration)),
      "}",
    ),

    _declaration: $ => choice(
      $.constant_declaration,
      $.variable_declaration,
      $.value_definition,
      $.operator_definition,
      alias($._operator_header_declaration, $.operator_definition),
      $.assumption_declaration,
      $.instance_declaration,
      $.anonymous_instance_declaration,
      $.named_import_declaration,
      $.wildcard_import_declaration,
      $.module_import_declaration,
      $.named_export_declaration,
      $.wildcard_export_declaration,
      $.module_export_declaration,
      $.type_alias_declaration,
      $.uninterpreted_type_declaration,
    ),

    constant_declaration: $ => seq(
      "const",
      field("name", choice($.identifier, $.qualified_identifier)),
      ":",
      field("type", $._type),
    ),

    variable_declaration: $ => seq(
      "var",
      field("name", choice($.identifier, $.qualified_identifier)),
      ":",
      field("type", $._type),
    ),

    value_definition: $ => seq(
      optional(field("qualifier", "pure")),
      "val",
      choice(
        seq(
          field("name", $._normal_call_name),
          optional(seq("(", ")")),
          optional(seq(
            ":",
            field("type", $._type),
          )),
          optional(seq(
            "=",
            field("value", $._expression),
          )),
        ),
        seq(
          field("name", choice($.tuple_pattern, $.record_pattern)),
          "=",
          field("value", $._expression),
        ),
      ),
      optional(";"),
    ),

    operator_definition: $ => seq(
      $._operator_definition_head,
      "=",
      field("body", $._expression),
      optional(";"),
    ),

    _operator_header_declaration: $ => seq(
      $._operator_definition_head,
      optional(";"),
    ),

    _operator_definition_head: $ => operatorDefinitionHead($),

    _normal_call_name: $ => choice(
      $.identifier,
      $.qualified_identifier,
      $.reserved_operator,
    ),

    parameter: $ => field("name", identifierOrHole($)),

    annotated_parameter: $ => seq(
      field("name", identifierOrHole($)),
      ":",
      field("type", $._type),
    ),

    _return_type_annotation: $ => seq(
      ":",
      field("return_type", $._type),
    ),

    assumption_declaration: $ => seq(
      "assume",
      field("name", identifierOrHole($)),
      "=",
      field("condition", $._expression),
    ),

    instance_declaration: $ => seq(
      "import",
      field("module", choice($.identifier, $.qualified_identifier)),
      "(",
      $.instance_override,
      repeat(seq(",", $.instance_override)),
      optional(","),
      ")",
      "as",
      field("alias", choice($.identifier, $.qualified_identifier)),
      optional(seq(
        "from",
        field("source", $.string_literal),
      )),
    ),

    instance_override: $ => seq(
      field("name", choice($.identifier, $.qualified_identifier)),
      "=",
      field("value", $._expression),
    ),

    anonymous_instance_declaration: $ => seq(
      "import",
      field("module", choice($.identifier, $.qualified_identifier)),
      "(",
      $.instance_override,
      repeat(seq(",", $.instance_override)),
      optional(","),
      ")",
      ".",
      "*",
      optional(seq(
        "from",
        field("source", $.string_literal),
      )),
    ),

    named_import_declaration: $ => seq(
      "import",
      field("module", choice($.identifier, $.qualified_identifier)),
      ".",
      field("name", choice($.identifier, $.qualified_identifier)),
      optional(seq(
        "from",
        field("source", $.string_literal),
      )),
    ),

    wildcard_import_declaration: $ => seq(
      "import",
      field("module", choice($.identifier, $.qualified_identifier)),
      ".",
      "*",
      optional(seq(
        "from",
        field("source", $.string_literal),
      )),
    ),

    wildcard_export_declaration: $ => seq(
      "export",
      field("module", choice($.identifier, $.qualified_identifier)),
      ".",
      "*",
    ),

    named_export_declaration: $ => seq(
      "export",
      field("module", choice($.identifier, $.qualified_identifier)),
      ".",
      field("name", choice($.identifier, $.qualified_identifier)),
    ),

    module_import_declaration: $ => seq(
      "import",
      field("module", choice($.identifier, $.qualified_identifier)),
      optional(seq(
        "as",
        field("alias", choice($.identifier, $.qualified_identifier)),
      )),
      optional(seq(
        "from",
        field("source", $.string_literal),
      )),
    ),

    module_export_declaration: $ => seq(
      "export",
      field("module", choice($.identifier, $.qualified_identifier)),
      optional(seq(
        "as",
        field("alias", choice($.identifier, $.qualified_identifier)),
      )),
    ),

    type_alias_declaration: $ => seq(
      "type",
      field("name", choice($.identifier, $.qualified_identifier)),
      optional(seq(
        "[",
        field("parameter", $.type_parameter),
        repeat(seq(",", field("parameter", $.type_parameter))),
        "]",
      )),
      "=",
      field("value", choice($._type, $.sum_type)),
    ),

    type_parameter: $ => field("name", $.type_variable),

    sum_type: $ => choice(
      seq(
        "|",
        $.sum_type_variant,
        repeat(seq("|", $.sum_type_variant)),
      ),
      seq(
        $.sum_type_variant,
        repeat1(seq("|", $.sum_type_variant)),
      ),
      alias($._sum_type_variant_with_payload, $.sum_type_variant),
    ),

    _sum_type_variant_with_payload: $ => seq(
      field("name", choice(
        $.identifier,
        alias($.type_variable, $.identifier),
        alias("Set", $.identifier),
        alias("List", $.identifier),
      )),
      "(",
      field("payload", $._type),
      ")",
    ),

    sum_type_variant: $ => seq(
      field("name", choice(
        $.identifier,
        alias($.type_variable, $.identifier),
        alias("Set", $.identifier),
        alias("List", $.identifier),
      )),
      optional(seq(
        "(",
        field("payload", $._type),
        ")",
      )),
    ),

    uninterpreted_type_declaration: $ => seq(
      "type",
      field("name", choice($.identifier, $.qualified_identifier)),
    ),

    _type: $ => choice(
      $._primary_type,
      $.operator_type,
      $.function_type,
    ),

    _primary_type: $ => choice(
      alias($._parenthesized_operator_type, $.operator_type),
      $.primitive_type,
      $.type_variable,
      $.invalid_map_type,
      $.type_application,
      $.named_type,
      $.set_type,
      $.list_type,
      $.unit_type,
      $.tuple_type,
      $.parenthesized_type,
      $.record_type,
    ),

    primitive_type: _ => choice("int", "bool", "str"),

    type_variable: _ => TYPE_VARIABLE_PATTERN,

    named_type: $ => field("name", choice(
      $.identifier,
      $.qualified_identifier,
      alias($._lowercase_qualified_identifier, $.qualified_identifier),
    )),

    invalid_map_type: $ => prec(2, seq(
      "Map",
      "[",
      field("key", $._type),
      ",",
      field("value", $._type),
      "]",
    )),

    type_application: $ => prec(1, seq(
      field("constructor", choice(
        $.identifier,
        $.qualified_identifier,
        alias($._lowercase_qualified_identifier, $.qualified_identifier),
      )),
      "[",
      field("argument", $._type),
      repeat(seq(",", field("argument", $._type))),
      "]",
    )),

    set_type: $ => seq(
      "Set",
      "[",
      field("element", $._type),
      "]",
    ),

    list_type: $ => seq(
      "List",
      "[",
      field("element", $._type),
      "]",
    ),

    operator_type: $ => prec.right(1, seq(
      field("parameter", choice($._primary_type, $.function_type)),
      "=>",
      field("result", $._type),
    )),

    // Like ANTLR's parenthesized typeOper alternative, this is a primary type.
    _parenthesized_operator_type: $ => prec.dynamic(4, prec.right(3, seq(
      "(",
      optional(seq(
        field("parameter", $._type),
        repeat(seq(",", field("parameter", $._type))),
      )),
      optional(","),
      ")",
      "=>",
      field("result", $._type),
    ))),

    unit_type: _ => seq("(", ")"),

    tuple_type: $ => seq(
      "(",
      field("element", $._type),
      ",",
      field("element", $._type),
      repeat(seq(",", field("element", $._type))),
      optional(","),
      ")",
    ),

    parenthesized_type: $ => seq(
      "(",
      field("type", $._type),
      ")",
    ),

    record_type: $ => seq(
      "{",
      optional(choice(
        seq(
          $.record_type_field,
          repeat(seq(",", $.record_type_field)),
          optional(choice(
            ",",
            seq("|", field("row", $.record_row)),
          )),
        ),
        seq("|", field("row", $.record_row)),
      )),
      "}",
    ),

    record_row: $ => field("name", $.identifier),

    record_type_field: $ => seq(
      field("name", $.identifier),
      ":",
      field("type", $._type),
    ),

    // ANTLR places function arrows above operator arrows in the type rule.
    function_type: $ => prec.right(2, seq(
      field("parameter", $._primary_type),
      "->",
      field("result", choice($._primary_type, $.function_type)),
    )),

    _expression: $ => choice(
      $.integer_literal,
      $.boolean_literal,
      $.string_literal,
      $.list_literal,
      $.tuple_literal,
      $.unit_literal,
      $.record_literal,
      $.block_expression,
      $._block_combinator_expression,
      $.assignment_expression,
      $.invalid_equality_expression,
      $.if_expression,
      $.match_expression,
      $.nested_definition_expression,
      $.lambda_expression,
      $.call_expression,
      $.ufcs_call_expression,
      $.field_access_expression,
      $.index_expression,
      $.namespace_access_expression,
      $.name_reference,
      $.invalid_identifier,
      $.parenthesized_expression,
      $.unary_expression,
      $.pair_expression,
      $.binary_expression,
    ),

    _block_combinator_expression: $ => choice(
      $.all_expression,
      $.and_block_expression,
      $.any_expression,
      $.or_block_expression,
    ),

    list_literal: $ => seq(
      "[",
      optional(seq(
        field("element", $._expression),
        repeat(seq(",", field("element", $._expression))),
      )),
      optional(","),
      "]",
    ),

    tuple_literal: $ => seq(
      "(",
      field("element", $._expression),
      ",",
      field("element", $._expression),
      repeat(seq(",", field("element", $._expression))),
      optional(","),
      ")",
    ),

    unit_literal: _ => seq("(", ")"),

    record_literal: $ => seq(
      "{",
      $._record_element,
      repeat(seq(",", $._record_element)),
      optional(","),
      "}",
    ),

    _record_element: $ => choice(
      $.record_literal_field,
      $.record_spread,
    ),

    record_literal_field: $ => seq(
      field("name", $.identifier),
      ":",
      field("value", $._expression),
    ),

    record_spread: $ => seq(
      "...",
      field("value", $._expression),
    ),

    block_expression: $ => seq(
      "{",
      repeat(field("binding", $.nondet_binding)),
      field("expression", $._expression),
      "}",
    ),

    // Keep the established block-binding node ahead of a general nested def.
    nondet_binding: $ => prec.right(PREC.BLOCK_BINDING, seq(
      "nondet",
      field("name", $._normal_call_name),
      "=",
      field("value", $._expression),
      optional(";"),
    )),

    any_expression: $ => seq(
      "any",
      "{",
      field("choice", $._expression),
      repeat(seq(",", field("choice", $._expression))),
      optional(","),
      "}",
    ),

    all_expression: $ => seq(
      "all",
      "{",
      field("conjunct", $._expression),
      repeat(seq(",", field("conjunct", $._expression))),
      optional(","),
      "}",
    ),

    and_block_expression: $ => seq(
      "and",
      "{",
      field("conjunct", $._expression),
      repeat(seq(",", field("conjunct", $._expression))),
      optional(","),
      "}",
    ),

    or_block_expression: $ => seq(
      "or",
      "{",
      field("disjunct", $._expression),
      repeat(seq(",", field("disjunct", $._expression))),
      optional(","),
      "}",
    ),

    assignment_expression: $ => prec.right(PREC.ASSIGNMENT, seq(
      field("target", $.primed_identifier),
      "=",
      field("value", $._expression),
    )),

    // ANTLR accepts the errorEq production syntactically and emits QNT006.
    // Keeping it in the tree preserves greedy decisions made before the error.
    invalid_equality_expression: $ => prec.left(PREC.INVALID_EQUALITY, seq(
      field("left", $._expression),
      "=",
      field("right", $._expression),
    )),

    primed_identifier: $ => seq(
      field("name", choice($.identifier, $.qualified_identifier)),
      "'",
    ),

    if_expression: $ => prec.right(PREC.BODY, seq(
      "if",
      "(",
      field("condition", $._expression),
      ")",
      field("consequence", $._expression),
      "else",
      field("alternative", $._expression),
    )),

    match_expression: $ => prec.right(seq(
      "match",
      field("value", $._expression),
      "{",
      optional("|"),
      field("arm", $.match_arm),
      repeat(seq("|", field("arm", $.match_arm))),
      "}",
    )),

    match_arm: $ => seq(
      choice(
        seq(
          field("variant", $.identifier),
          optional(seq(
            "(",
            field("parameter", choice($.identifier, $.hole)),
            ")",
          )),
        ),
        field("variant", $.hole),
      ),
      "=>",
      field("body", $._expression),
    ),

    nested_definition_expression: $ => prec.right(PREC.BODY, seq(
      field("definition", choice(
        $.value_definition,
        $.operator_definition,
        alias($._operator_header_declaration, $.operator_definition),
      )),
      field("body", $._expression),
    )),

    lambda_expression: $ => prec.right(PREC.BODY, seq(
      choice(
        field("parameter", identifierOrHole($)),
        seq(
          "(",
          field("parameter", identifierOrHole($)),
          repeat(seq(",", field("parameter", identifierOrHole($)))),
          ")",
        ),
        seq(
          "(",
          field("parameter", $.tuple_pattern),
          ")",
        ),
      ),
      "=>",
      field("body", $._expression),
    )),

    tuple_pattern: $ => seq(
      "(",
      field("element", identifierOrHole($)),
      ",",
      field("element", identifierOrHole($)),
      repeat(seq(",", field("element", identifierOrHole($)))),
      ")",
    ),

    record_pattern: $ => seq(
      "{",
      field("field", $.identifier),
      repeat(seq(",", field("field", $.identifier))),
      "}",
    ),

    field_access_expression: $ => fieldAccessExpression($, $._expression),

    index_expression: $ => indexExpression($, $._expression),

    call_expression: $ => callExpression($, $._expression),

    ufcs_call_expression: $ => ufcsCallExpression($, $._expression),

    reserved_operator: _ => choice(
      "and",
      "or",
      "iff",
      "implies",
      "leadsTo",
    ),

    namespace_access_expression: $ => seq(
      field("namespace", $.identifier),
      "::",
      field("member", $.identifier),
      repeat(seq("::", field("member", $.identifier))),
    ),

    parenthesized_expression: $ => seq(
      "(",
      field("expression", $._expression),
      ")",
    ),

    unary_expression: $ => prec(PREC.UNARY, seq(
      field("operator", "-"),
      field("operand", $._expression),
    )),

    pair_expression: $ => pairExpression($, $._expression),

    binary_expression: $ => binaryExpression($, $._expression),

    integer_literal: _ => /(?:0x[0-9a-fA-F](?:_?[0-9a-fA-F])*|0|[1-9](?:_?[0-9])*)/,

    boolean_literal: _ => choice("true", "false"),

    string_literal: $ => choice($._nul_string_literal, /"[^"]*"/),

    documentation_comment: $ => choice(
      $._nul_documentation_comment,
      token(prec(1, seq("///", /[^\n]*/, optional("\n")))),
    ),

    comment: $ => choice($._nul_comment, token(choice(
      seq("//", choice(
        "\n",
        seq(/[^/\n]/, /[^\n]*/, optional("\n")),
      )),
      seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/"),
    ))),

    // ANTLR's identifier rule consumes these tokens and reports QNT008. Keep
    // that diagnostic path so a greedy local call does not silently backtrack
    // into a different, apparently valid initializer/body boundary.
    invalid_identifier: _ => prec(-1, choice(
      "and", "or", "iff", "implies", "leadsTo", "match", "import", "export",
    )),

    name_reference: $ => field("name", $.identifier),

    qualified_identifier: $ => seq(
      field("namespace", $.identifier),
      repeat1(seq("::", field("name", $.identifier))),
    ),

    _lowercase_qualified_identifier: $ => seq(
      field("namespace", alias($.type_variable, $.identifier)),
      repeat1(seq("::", field("name", choice(
        $.identifier,
        alias($.type_variable, $.identifier),
      )))),
    ),

    hole: _ => "_",

    identifier: _ => IDENTIFIER_PATTERN,
  }),
});
