/**
 * @file Tree-sitter grammar for Quint
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

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

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
  },
});
