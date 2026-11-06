module Math { val answer = 42 }

module Reexport {
  export Math
  //     ^^^^ module
  export Math as Arithmetic
  //     ^^^^ module
  //             ^^^^^^^^^^ module
}
