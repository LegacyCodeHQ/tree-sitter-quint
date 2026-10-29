module Grammar033Integration {
  type Predicate = int -> int => bool
  const predicate: Predicate
  const nullary: (,) => bool
  var x: int

  pure val empty(): List[int] = [,]
  pure def sumPair(n: int): int = {
    pure val pair() = (n, n + 1)
    val (a, b) = pair
    a + b
  }

  action init = x' = 0
  action step = x' = x + 1
  temporal increasing = always((next(x) > x).orKeep(x))
  temporal conditional = always((if (x < 3) next(x) == x + 1 else next(x) == 0).orKeep(x))
  temporal negated = always(not(step).orKeep(x))
  temporal changed = always((next(x) > x).mustChange(x))
}
