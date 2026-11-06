module Holes {
  type Elem = Str(str) | Num(int)
  pure val (first, _) = (1, 2)
  //               ^ variable.special
  val value: Elem = Num(1)
  val shown = match value { Str(_) => 0 | _ => 1 }
  //                            ^ variable.special
  //                                      ^ variable.special
}
