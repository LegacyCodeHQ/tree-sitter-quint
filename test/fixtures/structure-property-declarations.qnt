module Properties {
  val ready = true
  invariant safe: bool = ready
  observation seen() = safe;
  invariant header: bool
  observation predicate(flag: bool): bool = flag
}
