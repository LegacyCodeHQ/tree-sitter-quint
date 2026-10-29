module ParameterizedHeaderBodies {
  pure val seed = 1
  pure def untyped = {
    val saved = def pendingHeader(p)
    -seed
    saved
  }
  pure def multiple = {
    val saved = def pendingHeader(p, q,)
    -seed
    saved
  }
  pure def annotated = {
    val saved = def pendingHeader(p: int): bool
    -seed
    saved
  }
}
