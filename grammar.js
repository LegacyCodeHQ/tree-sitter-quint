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
      repeat($.constant_declaration),
      "}",
    ),

    constant_declaration: $ => seq(
      "const",
      field("name", $.identifier),
      ":",
      field("type", $._type),
    ),

    _type: $ => choice(
      $.primitive_type,
      $.set_type,
      $.list_type,
      $.tuple_type,
      $.function_type,
    ),

    primitive_type: _ => choice("int", "bool", "str"),

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

    function_type: $ => prec.right(seq(
      field("parameter", $._type),
      "->",
      field("result", $._type),
    )),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
  },
});
