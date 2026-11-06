module Nondet {
  var n: int
  action step = {
    nondet pick = oneOf(1.to(3))
    //     ^^^^ variable
    n' = pick
  }
}
