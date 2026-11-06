module Math {
  def pow(x, y) = x^y
}

module Imports {
  import Math.pow
  //     ^^^^ module
  //          ^^^ variable
}
