module OperatorTypeConstructors {
  const binaryResult: int -> (int, bool) => str
  const unaryResult: int -> (int) => bool
  const nullaryResult: int -> () => bool
  const bareArrow: int -> int => bool
  const groupedResult: int -> (int => bool)
}
