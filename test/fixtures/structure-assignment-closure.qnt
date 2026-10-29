module AssignmentClosure {
  var x: int
  temporal check = {
    temporal condition = true == x' = 1 and x' = 2
    (condition, true) == (true, true)
  }
}
