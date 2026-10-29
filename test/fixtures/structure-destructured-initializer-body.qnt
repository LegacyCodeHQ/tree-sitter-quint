module DestructuredBody {
  pure val pairRecord = {left: 1, right: 2}
  pure val pairTuple = (1, 2)
  pure def recordResult = {
    def outer = val {left, right} = def inner() = pairRecord
    pairRecord
    (left)
    0
  }
  pure def tupleResult = {
    def outer = val (left, right) = def inner() = pairTuple
    pairTuple
    (left)
    0
  }
}
