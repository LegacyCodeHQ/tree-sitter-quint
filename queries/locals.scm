[
  (operator_definition)
  (lambda_expression)
  (match_arm)
] @local.scope

(parameter
  name: (identifier) @local.definition)

(annotated_parameter
  name: (identifier) @local.definition)

(lambda_expression
  parameter: (identifier) @local.definition)

(match_arm
  parameter: (identifier) @local.definition)

(nondet_binding
  name: (identifier) @local.definition)

(tuple_pattern
  (identifier) @local.definition)

(record_pattern
  (identifier) @local.definition)

(nested_definition_expression
  definition: (value_definition
    name: (identifier) @local.definition))

(nested_definition_expression
  definition: (operator_definition
    name: (identifier) @local.definition))

(name_reference
  name: (identifier) @local.reference)
