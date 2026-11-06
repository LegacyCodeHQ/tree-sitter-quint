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

(assumption_declaration
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
  name: [
    (identifier)
    (qualified_identifier)
  ] @constant)

(operator_definition
  name: [
    (identifier)
    (qualified_identifier)
    (reserved_operator)
  ] @function)

(ufcs_call_expression
  method: [
    (identifier)
    (qualified_identifier)
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

(named_type
  name: [
    (identifier)
    (qualified_identifier)
  ] @type)

(sum_type_variant
  name: (identifier) @constructor)

(match_arm
  variant: (identifier) @constructor)

(match_arm
  parameter: (identifier) @variable.parameter)

(primitive_type) @type.builtin

[
  "List"
  "Map"
  "Set"
] @type.builtin
(integer_literal) @number
(boolean_literal) @boolean
(string_literal) @string
(invalid_identifier) @error
(invalid_equality_expression "=" @error)

(name_reference
  name: (identifier) @variable)

(tuple_pattern
  element: (hole) @variable.special)

(match_arm
  variant: (hole) @variable.special)

(match_arm
  parameter: (hole) @variable.special)

(assumption_declaration
  name: (hole) @variable.special)

(namespace_access_expression
  namespace: (identifier) @type
  member: (identifier) @variable)

(module_import_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type
  alias: [
    (identifier)
    (qualified_identifier)
  ] @type)

(instance_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type
  alias: [
    (identifier)
    (qualified_identifier)
  ] @type)

(wildcard_import_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type)

(named_import_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type
  name: [
    (identifier)
    (qualified_identifier)
  ] @variable)

(wildcard_export_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type)

(named_export_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type
  name: [
    (identifier)
    (qualified_identifier)
  ] @variable)

(anonymous_instance_declaration
  module: [
    (identifier)
    (qualified_identifier)
  ] @type)

(instance_override
  name: [
    (identifier)
    (qualified_identifier)
  ] @variable)

(primed_identifier
  name: [
    (identifier)
    (qualified_identifier)
  ] @variable
  "'" @operator)

(record_literal_field
  name: (identifier) @property)

(field_access_expression
  field: [
    (identifier)
    (qualified_identifier)
  ] @property)

(record_pattern
  field: (identifier) @variable)

(tuple_pattern
  element: [
    (identifier)
    (qualified_identifier)
  ] @variable)

(lambda_expression
  parameter: [
    (identifier)
    (qualified_identifier)
  ] @variable.parameter)

(nondet_binding
  name: [
    (identifier)
    (qualified_identifier)
  ] @variable)

(documentation_comment) @comment.doc
(comment) @comment
(hashbang) @comment

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
  "|"
  "."
  "::"
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
  "..."
] @operator

; Later patterns win over earlier ones that capture the same node.
(call_expression
  function: (name_reference
    name: (identifier) @function))

(call_expression
  function: (namespace_access_expression
    member: (identifier) @function))
