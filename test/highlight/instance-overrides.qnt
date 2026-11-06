module Voting {
  const Value: Set[int]
  val Count = 1
}

module Imports {
  import Voting(Value = Set(0, 1)) as Ballot
  //            ^^^^^ variable
}
