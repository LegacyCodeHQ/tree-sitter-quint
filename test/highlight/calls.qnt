module Calls {
  pure def twice(n: int): int = n + n
  val total = twice(1)
  //          ^^^^^ function
}
