module Math { val answer = 42 }

module Use {
  import Math
  //     ^^^^ module
  import Math as Alias
  //     ^^^^ module
  //             ^^^^^ module
}
