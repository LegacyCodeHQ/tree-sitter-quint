module Other {
  pure def inc(n) = n + 1
}

module Spaces {
  import Other
  val v = Other::inc(1)
  //             ^^^ function
}
