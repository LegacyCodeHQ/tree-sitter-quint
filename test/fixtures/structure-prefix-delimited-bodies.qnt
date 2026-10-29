module PrefixDelimitedBodies {
  pure val seed = 1
  pure val recordValue = {number: 1}
  pure def lambdaCase = {
    def outer() = def inner() = p => seed - recordValue.number
    (seed)
    0
  }
  pure def conditionalCase = {
    val outer = val inner = if (true) 0 else seed - recordValue.number
    (seed)
    0
  }
}
