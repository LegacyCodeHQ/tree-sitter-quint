module AssignmentPrecedence {
  var x: int
  temporal conjunction = x' = 1 and always(true)
  temporal disjunction = x' = 1 or always(true)
  temporal equivalence = x' = 1 iff always(true)
  temporal implication = x' = 1 implies always(true)
}
