import { expect, test } from "bun:test";

test("regular assertions are enforced", () => {
  expect(1 + 1).toBe(2);
});

test("snapshot assertions compare approved output", () => {
  expect({ language: "quint", parser: "tree-sitter" }).toMatchSnapshot();
});
