/**
 * @file Tree-sitter grammar for Quint
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  PAIR: -1,
  ASSIGNMENT: 0,
  IMPLICATION: 1,
  LEADS_TO: 2,
  EQUIVALENCE: 3,
  DISJUNCTION: 4,
  CONJUNCTION: 5,
  EQUALITY: 6,
  COMPARISON: 7,
  ADDITIVE: 8,
  MULTIPLICATIVE: 9,
  UNARY: 10,
  POWER: 11,
  POSTFIX: 12,
};

export default grammar({
  name: "quint",

  externals: $ => [
    $._newline,
  ],

  extras: $ => [
    /\s/,
    $.comment,
  ],

  conflicts: $ => [
    [$.lambda_expression, $.name_reference],
    [$.lambda_expression, $.tuple_pattern],
    [$.lambda_expression, $.tuple_pattern, $.name_reference],
    [$.operator_type, $.tuple_type],
    [$.nondet_binding, $.binary_expression],
  ],

  rules: {
    source_file: $ => repeat($.module_definition),

    module_definition: $ => seq(
      "module",
      field("name", choice($.identifier, $.qualified_identifier)),
      "{",
      repeat($._declaration),
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
          field("name", choice($.identifier, $.qualified_identifier)),
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
          optional(seq(
            ":",
            field("type", $._type),
          )),
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

    _operator_definition_head: $ => choice(
        seq(
          field("qualifier", "pure"),
          "def",
          field("name", choice($.identifier, $.qualified_identifier)),
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
          field("name", choice($.identifier, $.qualified_identifier)),
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
          field("name", choice($.identifier, $.qualified_identifier)),
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
          field("name", choice($.identifier, $.qualified_identifier)),
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
          field("name", choice($.identifier, $.qualified_identifier)),
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
          field("name", choice($.identifier, $.qualified_identifier)),
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
    ),

    parameter: $ => field("name", $.identifier),

    annotated_parameter: $ => seq(
      field("name", $.identifier),
      ":",
      field("type", $._type),
    ),

    _return_type_annotation: $ => seq(
      ":",
      field("return_type", $._type),
    ),

    assumption_declaration: $ => seq(
      "assume",
      field("name", $.identifier),
      "=",
      field("condition", $._expression),
    ),

    instance_declaration: $ => seq(
      "import",
      field("module", choice($.identifier, $.qualified_identifier)),
      "(",
      optional(seq(
        $.instance_override,
        repeat(seq(",", $.instance_override)),
        optional(","),
      )),
      ")",
      optional(seq(
        "as",
        field("alias", choice($.identifier, $.qualified_identifier)),
      )),
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
      optional(seq(
        $.instance_override,
        repeat(seq(",", $.instance_override)),
        optional(","),
      )),
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
      field("name", $.identifier),
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
      $.primitive_type,
      $.type_variable,
      $.type_application,
      $.named_type,
      $.set_type,
      $.list_type,
      $.operator_type,
      $.unit_type,
      $.tuple_type,
      $.parenthesized_type,
      $.record_type,
      $.function_type,
    ),

    primitive_type: _ => choice("int", "bool", "str"),

    type_variable: _ => /(?:[a-z][A-Za-z0-9_]*|_[A-Za-z0-9_]+)/,

    named_type: $ => field("name", choice($.identifier, $.qualified_identifier)),

    type_application: $ => seq(
      field("constructor", choice($.identifier, $.qualified_identifier)),
      "[",
      field("argument", $._type),
      repeat(seq(",", field("argument", $._type))),
      "]",
    ),

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

    operator_type: $ => prec.right(choice(
      seq(
        "(",
        optional(seq(
          field("parameter", $._type),
          repeat(seq(",", field("parameter", $._type))),
          optional(","),
        )),
        ")",
        "=>",
        field("result", $._type),
      ),
      seq(
        field("parameter", $._operator_parameter_type),
        "=>",
        field("result", $._type),
      ),
    )),

    _operator_parameter_type: $ => choice(
      $.primitive_type,
      $.type_variable,
      $.type_application,
      $.named_type,
      $.set_type,
      $.list_type,
      $.record_type,
    ),

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

    function_type: $ => prec.right(seq(
      field("parameter", $._type),
      "->",
      field("result", $._type),
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
      $.any_expression,
      $.all_expression,
      $.and_block_expression,
      $.or_block_expression,
      $.assignment_expression,
      $.if_expression,
      $.match_expression,
      $.nested_definition_expression,
      $.lambda_expression,
      $.call_expression,
      $.field_access_expression,
      $.index_expression,
      $.namespace_access_expression,
      $.name_reference,
      $.parenthesized_expression,
      $.unary_expression,
      $.binary_expression,
    ),

    list_literal: $ => seq(
      "[",
      optional(seq(
        field("element", $._expression),
        repeat(seq(",", field("element", $._expression))),
        optional(","),
      )),
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
      field("name", $.identifier),
      "=",
      field("value", $._expression),
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

    if_expression: $ => prec.right(seq(
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
      field("variant", $.identifier),
      optional(seq(
        "(",
        field("parameter", $.identifier),
        ")",
      )),
      "=>",
      field("body", $._expression),
    ),

    nested_definition_expression: $ => choice(
      prec.right(seq(
        field("definition", alias($._local_value_definition_unterminated, $.value_definition)),
        field("body", choice($.all_expression, $.any_expression)),
      )),
      prec.right(seq(
        field("definition", alias($._local_value_definition, $.value_definition)),
        field("body", $._expression),
      )),
      prec.right(seq(
        field("definition", $.operator_definition),
        field("body", $._expression),
      )),
    ),

    _local_value_definition: $ => seq(
      optional(field("qualifier", "pure")),
      "val",
      field("name", choice(
        $.identifier,
        $.qualified_identifier,
        $.tuple_pattern,
        $.record_pattern,
      )),
      optional(seq(
        ":",
        field("type", $._type),
      )),
      "=",
      field("value", $._expression),
      choice(";", $._newline),
    ),

    _local_value_definition_unterminated: $ => seq(
      optional(field("qualifier", "pure")),
      "val",
      field("name", choice(
        $.identifier,
        $.qualified_identifier,
        $.tuple_pattern,
        $.record_pattern,
      )),
      optional(seq(
        ":",
        field("type", $._type),
      )),
      "=",
      field("value", $._expression),
    ),

    lambda_expression: $ => prec.right(seq(
      choice(
        field("parameter", $.identifier),
        seq(
          "(",
          field("parameter", $.identifier),
          repeat(seq(",", field("parameter", $.identifier))),
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
      field("element", $.identifier),
      ",",
      field("element", $.identifier),
      repeat(seq(",", field("element", $.identifier))),
      ")",
    ),

    record_pattern: $ => seq(
      "{",
      field("field", $.identifier),
      repeat(seq(",", field("field", $.identifier))),
      "}",
    ),

    field_access_expression: $ => prec.left(PREC.POSTFIX, seq(
      field("object", $._expression),
      ".",
      field("field", choice($.identifier, $.reserved_operator)),
    )),

    index_expression: $ => prec.left(PREC.POSTFIX, seq(
      field("collection", $._expression),
      "[",
      field("index", $._expression),
      "]",
    )),

    call_expression: $ => prec.left(PREC.POSTFIX, seq(
      field("function", choice(
        $.name_reference,
        $.namespace_access_expression,
        $.field_access_expression,
        $.reserved_operator,
      )),
      "(",
      optional(seq(
        field("argument", $._expression),
        repeat(seq(",", field("argument", $._expression))),
        optional(","),
      )),
      ")",
    )),

    reserved_operator: _ => choice(
      "and",
      "or",
      "iff",
      "implies",
      "leadsTo",
    ),

    namespace_access_expression: $ => prec.left(PREC.POSTFIX, seq(
      field("namespace", $.identifier),
      "::",
      field("member", $.identifier),
      repeat(seq("::", field("member", $.identifier))),
    )),

    parenthesized_expression: $ => seq(
      "(",
      field("expression", $._expression),
      ")",
    ),

    unary_expression: $ => prec(PREC.UNARY, seq(
      field("operator", "-"),
      field("operand", $._expression),
    )),

    binary_expression: $ => choice(
      prec.left(PREC.PAIR, seq(
        field("left", $._expression),
        field("operator", "->"),
        field("right", $._expression),
      )),
      prec.left(PREC.IMPLICATION, seq(
        field("left", $._expression),
        field("operator", "implies"),
        field("right", $._expression),
      )),
      prec.left(PREC.LEADS_TO, seq(
        field("left", $._expression),
        field("operator", "leadsTo"),
        field("right", $._expression),
      )),
      prec.left(PREC.EQUIVALENCE, seq(
        field("left", $._expression),
        field("operator", "iff"),
        field("right", $._expression),
      )),
      prec.left(PREC.DISJUNCTION, seq(
        field("left", $._expression),
        field("operator", "or"),
        field("right", $._expression),
      )),
      prec.left(PREC.CONJUNCTION, seq(
        field("left", $._expression),
        field("operator", "and"),
        field("right", $._expression),
      )),
      prec.left(PREC.EQUALITY, seq(
        field("left", $._expression),
        field("operator", choice("==", "!=")),
        field("right", $._expression),
      )),
      prec.left(PREC.COMPARISON, seq(
        field("left", $._expression),
        field("operator", choice("<", "<=", ">", ">=")),
        field("right", $._expression),
      )),
      prec.left(PREC.ADDITIVE, seq(
        field("left", $._expression),
        field("operator", choice("+", "-")),
        field("right", $._expression),
      )),
      prec.left(PREC.MULTIPLICATIVE, seq(
        field("left", $._expression),
        field("operator", choice("*", "/", "%")),
        field("right", $._expression),
      )),
      prec.right(PREC.POWER, seq(
        field("left", $._expression),
        field("operator", "^"),
        field("right", $._expression),
      )),
    ),

    integer_literal: _ => /(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|[0-9](?:_?[0-9])*)/,

    boolean_literal: _ => choice("true", "false"),

    string_literal: _ => /"[^"\\\r\n]*"/,

    comment: _ => token(choice(
      seq("//", /[^\r\n]*/),
      seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/"),
    )),

    name_reference: $ => field("name", $.identifier),

    qualified_identifier: $ => seq(
      field("namespace", $.identifier),
      repeat1(seq("::", field("name", $.identifier))),
    ),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
  },
});
