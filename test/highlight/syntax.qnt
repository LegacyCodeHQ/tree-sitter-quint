/// Highlighting fixture
// <- comment.documentation
module Highlights {
  const LIMIT: int
  // <- keyword
  //    ^^^^^ constant
  //           ^^^ type.builtin

  var balance: int
  // <- keyword
  //  ^^^^^^^ variable

  pure val greeting = "hello"
  // <- keyword
  //   ^^^ keyword
  //       ^^^^^^^^ constant
  //                  ^^^^^^^ string

  pure def add(amount: int): int = amount + 1
  // <- keyword
  //   ^^^ keyword
  //       ^^^ function
  //           ^^^^^^ variable.parameter
  //                   ^^^ type.builtin
  //                         ^^^ type.builtin
  //                                      ^ operator

  type Option[a] = Some(a) | None
  // <- keyword
  //   ^^^^^^ type
  //          ^ type
  //               ^^^^ constructor
  //                    ^ type
  //                         ^^^^ constructor

  val flag = true
  // <- keyword
  //  ^^^^ constant
  //         ^^^^ boolean

  val pair = (1, 2)
  //          ^ number
  //             ^ number
  //           ^ punctuation.delimiter
}
// <- punctuation.bracket
