module NondetBoundaries {
  var x: int
  action unary = {
    nondet n = Set(1, 2).oneOf()
    x' = -n
  }
  def listBody = {
    nondet n = Set(1, 2).oneOf()
    [n == 1, true].head()
  }
  def tupleBody = {
    nondet n = Set(1, 2).oneOf()
    (n, n) == (1, 1)
  }
}
