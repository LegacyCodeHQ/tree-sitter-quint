module UnaryLocalBodyPrecedence {
  pure val seed = 1
  pure def number(n: int): int = n
  pure def division = {
    def outer = val saved = number(0)
    -seed / seed
    seed
  }
  pure def relation = {
    val outer = val inner = val pending
    seed
    -seed < seed
    seed
  }
}
