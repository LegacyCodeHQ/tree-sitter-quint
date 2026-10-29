module ReferenceProductionWitnesses {
  type Token
  var state: int
  action choose = any { state' = 0, state' = 1 }
}
