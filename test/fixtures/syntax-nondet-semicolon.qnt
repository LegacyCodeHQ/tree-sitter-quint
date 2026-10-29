module NondetSemicolon {
  var x: int
  action step = {
    nondet n = Set(1, 2).oneOf();
    x' = n
  }
}
