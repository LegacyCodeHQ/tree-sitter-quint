module AssignedLocalValueOperand {
  var state: int
  pure val seed = 1
  def result = {
    val saved = state' = seed -val pending = seed()
    seed
  }
}
