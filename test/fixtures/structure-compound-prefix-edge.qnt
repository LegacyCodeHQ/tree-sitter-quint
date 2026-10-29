module CompoundPrefixEdge {
  pure val seed = 1
  pure val values = List(1)
  pure def number(n: int): int = n
  pure def lambdaCase = {
    val saved = def inner = p => seed
    -seed
    seed()
  }
  pure def terminatedCall = {
    val saved = def inner = -number
    (0);
    val last = values[0]
    values
  }
}
