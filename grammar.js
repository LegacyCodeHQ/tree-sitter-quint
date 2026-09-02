/**
 * @file Tree-sitter grammar for Quint
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  EQUALITY: 1,
  COMPARISON: 2,
  ADDITIVE: 3,
  MULTIPLICATIVE: 4,
  UNARY: 5,
};

export default grammar({
  name: "quint",

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
      "val",
      field("name", $.identifier),
      "=",
      field("value", $._expression),
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
      $.name_reference,
      $.parenthesized_expression,
      $.unary_expression,
      $.binary_expression,
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
      prec.left(PREC.EQUALITY, seq(
        field("left", $._expression),
        field("operator", choice("==", "!=")),
        field("right", $._expression),
      )),
      prec.left(PREC.COMPARISON, seq(
        field("left", $._expression),
        field("operator", "<"),
        field("right", $._expression),
      )),
      prec.left(PREC.ADDITIVE, seq(
        field("left", $._expression),
        field("operator", choice("+", "-")),
        field("right", $._expression),
      )),
      prec.left(PREC.MULTIPLICATIVE, seq(
        field("left", $._expression),
        field("operator", choice("*", "/")),
        field("right", $._expression),
      )),
    ),

    integer_literal: _ => /[0-9]+/,

    boolean_literal: _ => choice("true", "false"),

    string_literal: _ => /"[^"\\\r\n]*"/,

    name_reference: $ => field("name", $.identifier),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
  },
});
