module PostfixDelimitedBody {
  pure val seed = 1
  pure val recordValue = {number: 1}
  pure def result = {
    def outer = val saved = seed
    -seed
    (recordValue).number -1
  }
}
