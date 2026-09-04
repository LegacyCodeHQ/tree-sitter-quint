"module" @keyword

[
  "action"
  "all"
  "any"
  "as"
  "assume"
  "const"
  "def"
  "else"
  "export"
  "from"
  "if"
  "import"
  "match"
  "nondet"
  "pure"
  "run"
  "temporal"
  "type"
  "val"
  "var"
] @keyword

[
  "and"
  "iff"
  "implies"
  "leadsTo"
  "or"
] @operator

(module_definition
  name: [
    (identifier)
    (qualified_identifier)
  ] @type)

(constant_declaration
  name: [
    (identifier)
    (qualified_identifier)
  ] @constant)

(variable_declaration
  name: [
    (identifier)
    (qualified_identifier)
  ] @variable)

(value_definition
  name: (identifier) @constant)

(operator_definition
  name: [
    (identifier)
    (qualified_identifier)
    (reserved_operator)
  ] @function)

(parameter
  name: [
    (identifier)
    (qualified_identifier)
    (hole)
  ] @variable.parameter)

(annotated_parameter
  name: [
    (identifier)
    (qualified_identifier)
    (hole)
  ] @variable.parameter)

(type_alias_declaration
  name: [
    (identifier)
    (qualified_identifier)
  ] @type)

(uninterpreted_type_declaration
  name: [
    (identifier)
    (qualified_identifier)
  ] @type)

(type_parameter
  name: (type_variable) @type)

(type_variable) @type

(sum_type_variant
  name: (identifier) @constructor)

(primitive_type) @type.builtin
(integer_literal) @number
(boolean_literal) @boolean
(string_literal) @string

(name_reference
  name: (identifier) @variable)

(documentation_comment) @comment.doc
(comment) @comment

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ":"
  ";"
] @punctuation.delimiter

[
  "="
  "=="
  "!="
  "<"
  "<="
  ">"
  ">="
  "+"
  "-"
  "*"
  "/"
  "%"
  "^"
  "=>"
  "->"
] @operator
