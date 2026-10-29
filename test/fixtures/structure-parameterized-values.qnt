module ParameterizedValueStructure {
  // Syntax fixtures: mode checking separately rejects parameters on val definitions.
  val identity(x) = x
  pure val annotated(x: int): int = x
  pure /* qualifier comment */ val answer = 42
}
