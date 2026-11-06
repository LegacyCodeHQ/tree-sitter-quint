module Other {
  val limit = 1
}

module Spaces {
  import Other
  val v = Other::limit
  //      ^^^^^ module
}
