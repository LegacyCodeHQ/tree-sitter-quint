module SecondPassSource {
  const N: int
  pure val count = N
}

module SecondPassIntegration {
  import SecondPassSource(N = 1,) as Configured
  import SecondPassSource(N = 2,).*

  type Maybe = Some(int) | None
  const mapper: int -> (int, bool) => str
  pure def apply(f: () => int): int = f(,)
  pure def mapped = x => x -> Configured::count
  pure val conditional = if (true) 1 -> 2 else 3 -> 4
  pure val local = val x = Configured::count x -> 2
  pure def unpack(value: Maybe): int = match value {
    | Some(x) => x
    | _ => 0
  }
  var state: int
  temporal constrained = state' = 1 and always(true)
}
