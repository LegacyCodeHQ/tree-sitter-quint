module HeaderContinuationPositive {
  pure val seed = 1
  pure def result = {
    val saved = { def pendingHeader(): bool; () };
    def laterOp() = seed
    seed
  }
}
