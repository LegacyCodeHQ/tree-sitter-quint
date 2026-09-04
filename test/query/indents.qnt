module Indents {
  type Pair = (int, int)

  pure def example(value: int): { pair: Pair, values: List[int] } = {
    val values = [value, value + 1]
    val pair = (value, values[0])
    match Some({ pair: pair, values: values }) {
      | Some(record) => all {
          record.values.length() > 0,
          true,
        }
      | None => false
    }
  }
}
