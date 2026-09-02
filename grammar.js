/**
 * @file Tree-sitter grammar for Quint
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
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

  extras: $ => [
    /\s/,
    $.comment,
  ],

  conflicts: $ => [
    [$.lambda_expression, $.name_reference],
  ],

  rules: {
    source_file: $ => repeat($.module_definition),

    module_definition: $ => seq(
      "module",
      field("name", $.identifier),
      "{",
      repeat($._declaration),
      "}",
    ),

    _declaration: $ => choice(
      $.constant_declaration,
      $.variable_declaration,
      $.value_definition,
      $.operator_definition,
      $.assumption_declaration,
      $.type_alias_declaration,
      $.uninterpreted_type_declaration,
    ),

    constant_declaration: $ => seq(
      "const",
      field("name", $.identifier),
      ":",
      field("type", $._type),
    ),

    variable_declaration: $ => seq(
      "var",
      field("name", $.identifier),
      ":",
      field("type", $._type),
    ),

    value_definition: $ => seq(
      optional(field("qualifier", "pure")),
      "val",
      field("name", $.identifier),
      "=",
      field("value", $._expression),
    ),

    operator_definition: $ => seq(
      choice(
        seq(
          field("qualifier", "pure"),
          "def",
          field("name", $.identifier),
          optional(choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              ")",
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "action"),
          field("name", $.identifier),
          optional(choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              ")",
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "nondet"),
          field("name", $.identifier),
          optional(choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              ")",
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "temporal"),
          field("name", $.identifier),
          optional(choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              ")",
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
        seq(
          field("qualifier", "run"),
          field("name", $.identifier),
          optional(choice(
            seq(
              "(",
              field("parameter", $.annotated_parameter),
              repeat(seq(",", field("parameter", $.annotated_parameter))),
              ")",
              ":",
              field("return_type", $._type),
            ),
            seq(
              "(",
              field("parameter", $.parameter),
              repeat(seq(",", field("parameter", $.parameter))),
              ")",
            ),
            seq(
              ":",
              field("return_type", $._type),
            ),
          )),
        ),
      ),
      "=",
      field("body", $._expression),
    ),

    parameter: $ => field("name", $.identifier),

    annotated_parameter: $ => seq(
      field("name", $.identifier),
      ":",
      field("type", $._type),
    ),

    assumption_declaration: $ => seq(
      "assume",
      field("name", $.identifier),
      "=",
      field("condition", $._expression),
    ),

    type_alias_declaration: $ => seq(
      "type",
      field("name", $.identifier),
      "=",
      field("value", $._type),
    ),

    uninterpreted_type_declaration: $ => seq(
      "type",
      field("name", $.identifier),
    ),

    _type: $ => choice(
      $.primitive_type,
      $.named_type,
      $.set_type,
      $.list_type,
      $.tuple_type,
      $.parenthesized_type,
      $.record_type,
      $.function_type,
    ),

    primitive_type: _ => choice("int", "bool", "str"),

    named_type: $ => field("name", $.identifier),

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

    tuple_type: $ => seq(
      "(",
      field("element", $._type),
      ",",
      field("element", $._type),
      repeat(seq(",", field("element", $._type))),
      ")",
    ),

    parenthesized_type: $ => seq(
      "(",
      field("type", $._type),
      ")",
    ),

    record_type: $ => seq(
      "{",
      $.record_type_field,
      repeat(seq(",", $.record_type_field)),
      "}",
    ),

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
      $.assignment_expression,
      $.if_expression,
      $.lambda_expression,
      $.call_expression,
      $.field_access_expression,
      $.index_expression,
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
      )),
      "]",
    ),

    tuple_literal: $ => seq(
      "(",
      field("element", $._expression),
      ",",
      field("element", $._expression),
      repeat(seq(",", field("element", $._expression))),
      ")",
    ),

    unit_literal: _ => seq("(", ")"),

    record_literal: $ => seq(
      "{",
      $.record_literal_field,
      repeat(seq(",", $.record_literal_field)),
      "}",
    ),

    record_literal_field: $ => seq(
      field("name", $.identifier),
      ":",
      field("value", $._expression),
    ),

    block_expression: $ => seq(
      "{",
      field("expression", $._expression),
      "}",
    ),

    assignment_expression: $ => prec.right(PREC.ASSIGNMENT, seq(
      field("target", $.primed_identifier),
      "=",
      field("value", $._expression),
    )),

    primed_identifier: $ => seq(
      field("name", $.identifier),
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

    lambda_expression: $ => prec.right(seq(
      choice(
        field("parameter", $.identifier),
        seq(
          "(",
          field("parameter", $.identifier),
          repeat(seq(",", field("parameter", $.identifier))),
          ")",
        ),
      ),
      "=>",
      field("body", $._expression),
    )),

    field_access_expression: $ => prec.left(PREC.POSTFIX, seq(
      field("object", $._expression),
      ".",
      field("field", $.identifier),
    )),

    index_expression: $ => prec.left(PREC.POSTFIX, seq(
      field("collection", $._expression),
      "[",
      field("index", $._expression),
      "]",
    )),

    call_expression: $ => seq(
      field("function", $.name_reference),
      "(",
      optional(seq(
        field("argument", $._expression),
        repeat(seq(",", field("argument", $._expression))),
      )),
      ")",
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

    binary_expression: $ => choice(
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

    integer_literal: _ => /[0-9]+/,

    boolean_literal: _ => choice("true", "false"),

    string_literal: _ => /"[^"\\\r\n]*"/,

    comment: _ => token(seq("//", /[^\r\n]*/)),

    name_reference: $ => field("name", $.identifier),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
  },
});
