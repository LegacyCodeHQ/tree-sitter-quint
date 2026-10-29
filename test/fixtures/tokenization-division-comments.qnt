module DivisionComments {
  pure val a = 8/2
  pure val b = 8 / /* between operator and operand */ 2
  pure val c = 8 // before the division
    / 2
  pure val d = 8 / // after the division
    2
  pure val e = 8 /* before the division */ / 2
}
