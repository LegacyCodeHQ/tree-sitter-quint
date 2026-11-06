module A {
  pure val greeting = "hello"
}

module B {
  import A.*
  export A.*
  //     ^ module
}
