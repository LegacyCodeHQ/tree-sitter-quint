#!/usr/bin/env quint
/// Tokenization parity fixture
module TokenParity {
  // Ordinary line comments are skipped by ANTLR.
  /* Ordinary block comments are skipped too. */
  const lowercase_1: int
  const _under2: int
  const Upper_3: int

  pure val decimals = [0, 1, 9, 10, 1_000]
  pure val hexadecimals = [0x0, 0xA_B, 0xdead_beef]
  pure val booleans = [true, false]
  pure val strings = ["", "plain text", "line one
line two"]

  pure def operators(a, b) =
    [a + b, a - b, a * b, a / b, a % b, a ^ b,
      a > b, a < b, a >= b, a <= b, a != b, a == b,
      a -> b]
}
