module IndexedPrefixInitializer {
  pure val values = List(1)
  pure def conditional = {
    val outer = val inner = if (true) 0 else values[0]
    values[0]
  }
  pure def unary = {
    def outer = def inner = -values[0]
    values[0]
  }
}
