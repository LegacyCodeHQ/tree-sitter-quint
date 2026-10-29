module LocalEmptyValueParameters {
  pure def identity(n: int): int = {
    pure val x(): int = n
    x
  }
}
