module Matches {
  type Elem = Str(str) | Num(int)
  val value: Elem = Num(1)
  val shown = match value { Str(text) => text | Num(count) => "number" }
  //                            ^^^^ variable.parameter
  //                                                ^^^^^ variable.parameter
}
