module PrefixCallListBody {
  pure def makeValues(dummy: int): List[int] = List(dummy)
  pure def keep(n: int): int = n
  pure def normal = { def outer() = def inner() = if (true) List(1) else makeValues
    (0)[0]
    0
  }
  pure def method = { def outer() = def inner() = if (true) 1 else 1.keep
    ()[0]
    0
  }
}
