module ContinuedOperatorInitializers {
  pure val seed = 1
  pure val values = List(1)
  pure def source(n: int): List[int] = List(n)
  pure def number(n: int): int = n
  pure def indexed = {
    val saved = def first = def second = source(0)[0];
    seed()
    seed
  }
  pure def nestedBody = {
    val saved = def inner = source(0)[0];
    val last = values[0]
    values
  }
  pure def arithmetic = {
    val saved = def inner = number(0)
    -seed;
    seed()
  }
}
