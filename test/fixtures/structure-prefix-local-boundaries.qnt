module PrefixBoundaries {
  pure def conditionalTuple(x: int): (int, int) = {
    val value = if (x > 0) x else -x
    (value, x)
  }
  pure def lambdaList(x: int): List[int] = {
    def f = y => y + x
    [f(1)]
  }
  pure def nestedUnary(x: int): int = {
    val value = val inner = x inner + 1
    -value
  }
  pure def operatorConditional(x: int): (int, int) = {
    def f = if (x > 0) x else -x
    (f, x)
  }
}
