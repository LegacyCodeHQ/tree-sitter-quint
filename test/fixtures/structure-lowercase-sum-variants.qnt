module LowercaseVariants {
  type Choice = present(int) | absent
  type Hidden = _some(bool) | _none
  pure val answer = present(1)
}
