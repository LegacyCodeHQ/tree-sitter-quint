module RelationPrecedence {
  // Syntax regression: this mixed chain is intentionally rejected by typechecking.
  pure val equalityThenOrdering = 1 == 2 < 3
  pure val orderingThenEquality = 1 < 2 == true
}
