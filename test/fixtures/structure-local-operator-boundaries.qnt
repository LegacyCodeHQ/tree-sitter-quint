module LocalOperators {
  pure def tupleBody(x: int): (int, int) = {
    def f = x
    (x, f)
  }
  pure def unaryBody(x: int): int = {
    def f = x + 1
    -f
  }
  pure def listBody(x: int): List[int] = {
    pure def f(p: int): int = p + x
    [f(1)]
  }
  pure def greedyBody(x: int): int = {
    def f = x - x
    -x
  }
}
