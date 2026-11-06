module Variants {
  type Elem = Str(str) | Num(int)
  //                   ^ punctuation.delimiter
  val value: Elem = Num(1)
  val shown = match value { Str(text) => text | Num(count) => "number" }
  //                                          ^ punctuation.delimiter
}
