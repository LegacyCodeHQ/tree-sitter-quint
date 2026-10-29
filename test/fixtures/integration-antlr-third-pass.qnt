#!/usr/bin/env quint typecheck
/// Integration of comment tokens and multiline local bindings.
module ThirdPassIntegration {
  var x: int

  /// A continued initializer followed by a separate body.
  pure def computed(): int = {
    val values = List(1, 2)
      /* the chain continues across this comment */
      .append(3)
      [0]
    val half = values
      / 1
    half
  }

  /// A semicolon ends the nondeterministic binding.
  action step = {
    nondet n = Set(1, 2).oneOf();
    x' = n + computed
  }
}
