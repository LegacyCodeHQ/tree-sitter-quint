module PrefixLocalBodies {
  pure val seed = 1
  pure val values = List(1)
  pure def number(n: int): int = n
  pure def nestedBody = {
    val saved = def inner = -number
    (0)
    val last = values[0]
    values
  }
  pure def unaryBody = {
    val outer = val inner = if (true) false else false or true.and(true)
    --seed;
    (seed)
  }
}
