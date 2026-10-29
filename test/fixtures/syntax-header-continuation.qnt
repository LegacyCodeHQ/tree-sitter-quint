module HeaderContinuationNegative {
  pure val seed = 1
  pure def result = {
    val saved = def pendingHeader()
    def laterOp() = seed
    seed
  }
  action choice = {
    nondet chosen = def pendingHeader()
    def laterOp() = seed
    seed == 1
  }
}
