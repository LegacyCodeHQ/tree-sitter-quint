module CommaCalls {
  pure def apply(f: () => int): int = f(,)
}
