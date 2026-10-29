/**
 * @file Tree-sitter grammar for Quint
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license Apache-2.0
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  // Bodies extend through a pair; right associativity keeps the pair inside.
  BODY: 0,
  PAIR: 0,
  IMPLICATION: 2,
  LEADS_TO: 3,
  EQUIVALENCE: 4,
  DISJUNCTION: 5,
  CONJUNCTION: 6,
  ASSIGNMENT: 7,
  RELATION: 8,
  ADDITIVE: 9,
  MULTIPLICATIVE: 10,
  UNARY: 11,
  POWER: 12,
  POSTFIX: 13,
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
  ],

  extras: $ => [
    /[ \t\r\n]/,
    $.comment,
  ],

  // Keep a local binding's end incomparable with numeric expression precedences.
  // GLR can then distinguish a continued initializer from a following body.
  precedences: _ => [["local_value"]],

  conflicts: $ => [
    [$._init_ufcs_expression, $._init_field_expression],
    [$._init_relation_expression, $._init_add_expression],
    [$._init_or_expression, $._init_and_expression],
    [$._init_iff_expression, $._init_or_expression],
    [$._init_leads_expression, $._init_iff_expression],
    [$._init_implication_expression, $._init_leads_expression],
    [$._init_pair_expression, $._init_implication_expression],
    [$._init_atom, $._init_call_expression],
    [$._init_atom, $._init_call_expression, $._local_value_definition_unterminated],
    [$._local_operator_definition_unterminated, $._init_atom, $._init_call_expression],
    [$._init_power, $._init_index_expression],
    [$._init_relation, $._init_add_expression],
    [$._init_or, $._init_and_expression],
    [$._init_iff, $._init_or_expression],
    [$._init_leads, $._init_iff_expression],
    [$._init_implication, $._init_leads_expression],
    [$._init_pair, $._init_implication_expression],
    [$._init_atom, $._local_value_definition_unterminated],
    [$._local_operator_definition_unterminated, $._init_atom],
    [$._parenthesized_operator_type, $.tuple_type],
    [$.lambda_expression, $.name_reference],
    [$.lambda_expression, $.tuple_pattern],
    [$.lambda_expression, $.tuple_pattern, $.name_reference],
    [$.namespace_access_expression, $.qualified_identifier],
  ],

  rules: {
    source_file: $ => seq(
      optional($.hashbang),
      repeat(choice($.documentation_comment, $.module_definition)),
      // An empty line comment at EOF remains useful in an editor buffer.
      optional(alias(token("//"), $.comment)),
    ),

    hashbang: _ => token(seq("#!", /[^\n]*/, optional("\n"))),

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

    _operator_definition_head: $ => prec.right(1, choice(
        seq(
          field("qualifier", "pure"),
          "val",
          field("name", $._normal_call_name),
          choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
          ),
        ),
        seq(
          "val",
          field("name", $._normal_call_name),
          choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
          ),
        ),
        seq(
          field("qualifier", "pure"),
          "def",
          field("name", $._normal_call_name),
          optional(choice(
            seq("(", ")", optional($._return_type_annotation)),
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          "def",
          field("name", $._normal_call_name),
          optional(choice(
            seq("(", ")", optional($._return_type_annotation)),
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "action"),
          field("name", $._normal_call_name),
          optional(choice(
            seq(
              "(",
              ")",
              optional(seq(
                ":",
                field("return_type", $._type),
              )),
            ),
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "nondet"),
          field("name", $._normal_call_name),
          optional(choice(
            seq("(", ")", optional($._return_type_annotation)),
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "temporal"),
          field("name", $._normal_call_name),
          optional(choice(
            seq("(", ")", optional($._return_type_annotation)),
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "run"),
          field("name", $._normal_call_name),
          optional(choice(
            seq("(", ")", optional($._return_type_annotation)),
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              optional(","),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              optional(","),
              ")",
              optional($._return_type_annotation),
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
    )),

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
      field("name", $.identifier),
      "(",
      field("payload", $._type),
      ")",
    ),

    sum_type_variant: $ => seq(
      field("name", $.identifier),
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
    _parenthesized_operator_type: $ => prec.dynamic(1, prec.right(3, seq(
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

    nondet_binding: $ => prec(1, seq(
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

    nested_definition_expression: $ => choice(
      prec.right(PREC.BODY, seq(
        field("definition", alias($._local_value_header, $.value_definition)),
        field("body", $._expression),
      )),
      prec.right(PREC.BODY, seq(
        field("definition", alias($._local_value_definition_unterminated, $.value_definition)),
        field("body", $._expression),
      )),
      prec.right(PREC.BODY, seq(
        field("definition", alias($._local_value_definition, $.value_definition)),
        field("body", $._expression),
      )),
      prec.right(PREC.BODY, seq(
        field("definition", alias($._local_operator_definition, $.operator_definition)),
        field("body", $._expression),
      )),
      prec.right(PREC.BODY, seq(
        field("definition", alias($._local_operator_definition_unterminated, $.operator_definition)),
        field("body", $._expression),
      )),
      prec.right(PREC.BODY, seq(
        field("definition", alias($._operator_header_declaration, $.operator_definition)),
        field("body", $._expression),
      )),
    ),

    _local_operator_definition: $ => seq(
      $._operator_definition_head,
      "=",
      field("body", $._initializer_expression),
      ";",
    ),

    _local_operator_definition_unterminated: $ => prec("local_value", seq(
      $._operator_definition_head,
      "=",
      field("body", choice(
        $._initializer_expression,
        $.name_reference,
        $.namespace_access_expression,
      )),
    )),

    _local_value_header: $ => seq(
      optional(field("qualifier", "pure")),
      "val",
      field("name", $._normal_call_name),
      optional(seq("(", ")")),
      optional(seq(
        ":",
        field("type", $._type),
      )),
      optional(";"),
    ),

    _local_value_definition: $ => seq(
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
        ),
        field("name", choice($.tuple_pattern, $.record_pattern)),
      ),
      "=",
      field("value", $._initializer_expression),
      ";",
    ),

    // A local initializer needs to stop even where its last operand could continue
    // as a call, index, or subtraction. Encoding precedence as levels lets GLR keep
    // that boundary open without changing normal expression precedence. Dynamic
    // weights prefer the longest initializer that still leaves a valid body.
    _initializer_expression: $ => $._init_pair,

    _init_pair: $ => choice(
      $._init_implication,
      alias($._init_pair_expression, $.pair_expression),
    ),

    _init_implication: $ => choice(
      $._init_leads,
      alias($._init_implication_expression, $.binary_expression),
    ),

    _init_leads: $ => choice(
      $._init_iff,
      alias($._init_leads_expression, $.binary_expression),
    ),

    _init_iff: $ => choice(
      $._init_or,
      alias($._init_iff_expression, $.binary_expression),
    ),

    _init_or: $ => choice(
      $._init_and,
      alias($._init_or_expression, $.binary_expression),
    ),

    _init_and: $ => choice(
      $._init_assignment,
      alias($._init_and_expression, $.binary_expression),
    ),

    _init_relation: $ => choice(
      $._init_add,
      alias($._init_relation_expression, $.binary_expression),
    ),

    _init_add: $ => choice(
      $._init_mul,
      alias($._init_add_expression, $.binary_expression),
    ),

    _init_mul: $ => choice(
      $._init_unary,
      alias($._init_mul_expression, $.binary_expression),
    ),

    _init_assignment: $ => choice(
      $._init_relation,
      alias($._init_assignment_expression, $.assignment_expression),
    ),
    _init_unary: $ => choice(
      $._init_power,
      alias($._init_unary_expression, $.unary_expression),
    ),
    _init_power: $ => choice(
      $._init_postfix,
      alias($._init_power_expression, $.binary_expression),
    ),
    _init_postfix: $ => choice(
      $._init_atom,
      alias($._init_call_expression, $.call_expression),
      alias($._init_index_expression, $.index_expression),
      alias($._init_ufcs_expression, $.ufcs_call_expression),
      alias($._init_field_expression, $.field_access_expression),
    ),
    _init_atom: $ => choice(
      $.integer_literal, $.boolean_literal, $.string_literal,
      $.list_literal, $.tuple_literal, $.unit_literal, $.record_literal,
      $.block_expression, $._block_combinator_expression,
      $.if_expression, $.match_expression, $.nested_definition_expression,
      $.lambda_expression, $.namespace_access_expression, $.name_reference,
      $.parenthesized_expression,
    ),

    _init_pair_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_pair),
      "->",
      field("right", $._init_implication),
    )),

    _init_implication_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_implication),
      field("operator", "implies"),
      field("right", $._init_leads),
    )),

    _init_leads_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_leads),
      field("operator", "leadsTo"),
      field("right", $._init_iff),
    )),

    _init_iff_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_iff),
      field("operator", "iff"),
      field("right", $._init_or),
    )),

    _init_or_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_or),
      field("operator", "or"),
      field("right", $._init_and),
    )),

    _init_and_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_and),
      field("operator", "and"),
      field("right", $._init_assignment),
    )),

    _init_relation_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_relation),
      field("operator", choice("==", "!=", "<", "<=", ">", ">=")),
      field("right", $._init_add),
    )),

    _init_add_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_add),
      field("operator", choice("+", "-")),
      field("right", $._init_mul),
    )),

    _init_mul_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_mul),
      field("operator", choice("*", alias($._division, "/"), "%")),
      field("right", $._init_unary),
    )),

    _init_assignment_expression: $ => seq(
      field("target", $.primed_identifier),
      "=",
      field("value", $._init_assignment),
    ),

    _init_unary_expression: $ => seq(
      field("operator", "-"),
      field("operand", $._init_unary),
    ),

    _init_power_expression: $ => prec.dynamic(1, seq(
      field("left", $._init_postfix),
      field("operator", "^"),
      field("right", $._init_unary),
    )),

    _init_call_expression: $ => prec.dynamic(1, seq(
      field("function", choice($.name_reference, $.namespace_access_expression, $.reserved_operator)),
      "(",
      optional(seq(
        field("argument", $._expression),
        repeat(seq(",", field("argument", $._expression))),
      )),
      optional(","),
      ")",
    )),

    _init_index_expression: $ => prec.dynamic(1, seq(
      field("collection", $._init_postfix),
      "[",
      field("index", $._expression),
      "]",
    )),

    _init_ufcs_expression: $ => prec.dynamic(1, seq(
      field("receiver", $._init_postfix),
      ".",
      field("method", choice($.identifier, $.qualified_identifier, $.reserved_operator)),
      "(",
      optional(seq(
        field("argument", $._expression),
        repeat(seq(",", field("argument", $._expression))),
      )),
      ")",
    )),

    _init_field_expression: $ => prec.dynamic(1, seq(
      field("object", $._init_postfix),
      ".",
      field("field", choice($.identifier, $.qualified_identifier, $.reserved_operator)),
    )),

    _local_value_definition_unterminated: $ => prec("local_value", seq(
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
        ),
        field("name", choice($.tuple_pattern, $.record_pattern)),
      ),
      "=",
      field("value", choice(
        $._initializer_expression,
        $.name_reference,
        $.namespace_access_expression,
      )),
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

    string_literal: _ => /"[^"]*"/,

    documentation_comment: _ => token(prec(1, seq("///", /[^\n]*/, optional("\n")))),

    comment: _ => token(choice(
      seq("//", choice(
        "\n",
        seq(/[^/\n]/, /[^\n]*/, optional("\n")),
      )),
      seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/"),
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
  },
});
