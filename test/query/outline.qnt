module Outline {
  const LIMIT: int
  var count: int
  assume Positive = LIMIT > 0
  type Choice = Picked(int) | Empty
  type MEMBER
  pure val initial = 0
  action increment(amount: int): bool = count' = count + amount
  import Counter(Max = LIMIT) as C
}
