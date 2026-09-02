module StructurePrecedence {
  pure val arithmetic = 1 + 2 * 3 ^ 4 - 5
  pure val logic = 1 < 2 and true or false implies true
  pure val access = 1.to(3)[0].to(2).size()
  type Operator = (int, str) => bool -> Set[List[int]]
}
