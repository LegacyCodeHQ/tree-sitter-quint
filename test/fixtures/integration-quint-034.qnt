module Checks {
  val invariant = true

  /// A property can refer to a value named invariant.
  invariant safe: bool = invariant
  observation reached = safe

  /// This comment has no following declaration.
}

module Counting {
  import Checks.*
  var count: int

  action init = count' = 0
  action step = count' = count + 1

  invariant nonnegative = count >= 0
  observation seenTwo = reached and count == 2

  /// End of the counting module.
}
