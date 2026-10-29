module ConditionalCallListBody {
  pure val seed = 1
  pure def number(n: int): int = n
  pure def result = {
    def outer = def inner = if (true) 0 else number
    (0)[0]
    -seed
  }
}
