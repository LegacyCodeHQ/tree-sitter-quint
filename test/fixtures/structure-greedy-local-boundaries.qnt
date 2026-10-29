module GreedyBoundaries {
  type Pair = (int, int)
  pure def tupleBody(pair: Pair): Pair = {
    val (x, y) = pair
    (x + 1, y + 1)
  }
  pure def nameBeforeTuple(pair: Pair): Pair = {
    val value = pair
    (value._1, value._2)
  }
  pure def unaryBody(a: int, b: int): bool = {
    val delta = a - b
    -a <= delta and delta <= b
  }
  pure def longestInitializer(a: int, b: int): int = {
    val delta = a - b - a - b
    -delta
  }
}
