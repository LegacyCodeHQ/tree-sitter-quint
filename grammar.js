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
    source_file: _ => blank(),
  },
});
