module C {
  pure def pow(x, y) = x^y
}

module B {
  import C as Inner
  export Inner
}

module A {
  import B as Outer
  val x = Outer::Inner::pow(2, 2)
  //      ^^^^^ module
  //             ^^^^^ module
  //                    ^^^ function
}
