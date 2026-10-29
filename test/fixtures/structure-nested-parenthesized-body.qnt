module NestedParenthesizedBody {
  pure val seed = 1
  pure def result = {
    def outer = val saved = def inner() = seed
    seed
    (seed)
    seed
  }
}
