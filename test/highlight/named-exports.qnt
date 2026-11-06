module Lib {
  pure val value = 1
  pure val Member::value = 2
}

module Use {
  export Lib.value
  //     ^^^ module
  //         ^^^^^ variable
  export Lib.Member::value
  //     ^^^ module
  //         ^^^^^^ variable
}
