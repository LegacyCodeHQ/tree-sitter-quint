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

    _type: $ => choice($.primitive_type, $.set_type),

    primitive_type: _ => choice("int", "bool", "str"),

    set_type: $ => seq(
      "Set",
      "[",
      field("element", $._type),
      "]",
    ),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
  },
});
