module HoleContexts {
  assume _ = true
  pure def ignore(_: int): int = 0
  pure val tupleLambda = ((_, right)) => right
  type Option = Some(int)
  pure val matched = match Some(1) { Some(_) => 0 }
  pure val (_, second) = (1, 2)
}
