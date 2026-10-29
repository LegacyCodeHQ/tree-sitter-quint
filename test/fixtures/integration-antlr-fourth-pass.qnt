module FourthAudit {
  var state: int
  pure def values(n: int): List[int] = {
    def absolute = if (n > 0) n else -n
    val count = List(n).length()
    def add = value => value + absolute
    val value = val one = count one + 1
    [add(value), -count]
  }
  def sample = {
    nondet selected = Set(1, 2).oneOf()
    (selected, selected) == (1, 1)
  }
  temporal step = {
    temporal condition = true == state' = 1 and state' = 2
    (condition, true) == (true, true)
  }
}
