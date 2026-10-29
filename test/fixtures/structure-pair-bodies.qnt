module PairBodies {
  pure def mapped = x => x -> 1
  pure val conditional = if (true) 1 -> 2 else 2 -> 3
  pure val local = val x = 1 x -> 2
  pure val terminated = val x = 1; x -> 2
}
