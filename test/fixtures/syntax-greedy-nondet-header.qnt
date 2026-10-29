module GreedyNondetHeader {
  pure val seed = 1
  pure val recordValue = {a: 1}
  def result = {
    def outer = nondet choice = seed
    -seed
    def later() = recordValue.a
    seed
  }
}
