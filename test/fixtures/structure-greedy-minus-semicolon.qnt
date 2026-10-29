module GreedyMinusSemicolon {
  pure val seed = 1
  pure def fromValue = { val saved = seed;
    -def later() = seed
    seed }
  pure def fromOperator = { def earlier() = seed;
    -def later() = seed
    seed }
}
