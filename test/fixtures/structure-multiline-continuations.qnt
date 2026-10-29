module MultilineContinuations {
  pure def indexed(): int = {
    val xs = List(1, 2)
      [0]
    xs
  }
  pure def commented(): List[int] = {
    val xs = List(1, 2)
      /* keep the chain together */
      .append(3)
    xs
  }
  pure def blankLines(): List[int] = {
    val xs = List(1, 2)

      .append(3)
    xs
  }
  pure def arithmetic(): int = {
    val n = 1
      + 2
    n
  }
  pure def subtraction(): int = {
    val n = 3
      - 1
    n
  }
  pure def booleanContinuation(): bool = {
    val flag = true
      and false
    flag
  }
  pure def listBody(): List[int] = {
    val ignored = 1
    [2, 3]
  }
}
