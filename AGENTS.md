# Agent Instructions

## Grammar development playbook

Use this workflow whenever extending the Quint Tree-sitter grammar. Work on one
small syntax capability at a time and create one conventional commit for each
capability.

### 1. Start from evidence

- Confirm the working tree state with `git status --short`. Preserve unrelated
  user changes.
- Create the smallest representative `.qnt` fixture for the proposed syntax.
- Run `quint parse <fixture>` before adding the fixture to the corpus. Positive
  corpus fixtures must be accepted by the installed Quint compiler; do not add
  syntax based only on memory or inference.
- Keep temporary Quint validation files outside the repository and remove them
  after the feature is complete.

### 2. Establish the red test

- Add the fixture and its intended syntax tree under `test/corpus/` in the most
  relevant corpus file. Create a focused corpus file when the construct is a
  new category.
- Prefer meaningful named nodes and fields such as `name`, `type`, `body`,
  `parameter`, `argument`, or another domain-specific role.
- Run the focused test with:

  ```sh
  tree-sitter test --include '<exact test name>'
  ```

- Confirm that it fails for the missing capability, not because the fixture or
  expected tree is malformed. Preserve the failure as evidence before changing
  `grammar.js`.

### 3. Implement the smallest grammar change

- Change only the rules required for the focused fixture.
- Preserve existing node shapes unless the new syntax requires a deliberate
  tree-contract change.
- Do not accept extensions that the Quint compiler rejects.
- When generation reports an ambiguity, resolve it according to Quint semantics
  with precedence, associativity, or a narrowly scoped conflict. Do not silence
  unrelated ambiguity broadly.

### 4. Generate and verify green

Run the generator and the complete test suite:

```sh
bun run generate
bun run test
```

All Tree-sitter corpus tests and Bun litmus tests must pass. Inspect failures for
regressions rather than updating existing expected trees automatically.

Generated files under `src/` are part of the repository contract. Commit every
generated change produced by the pinned Tree-sitter version, including
`grammar.json`, `node-types.json`, and `parser.c` when modified.

### 5. Add integration coverage when needed

- After independently testing interacting capabilities, add a complete valid
  Quint program to `test/corpus/integration.txt`.
- Validate the exact integration program with `quint parse` first.
- A placeholder expected tree may be used to capture the initial approval diff.
  Approve only after inspecting the produced tree and confirming it contains no
  `ERROR` or `MISSING` nodes.
- Update that one approval with field names enabled:

  ```sh
  tree-sitter test --update --show-fields --include '<exact test name>'
  ```

- Run the full test suite again after approval.

### 6. Stage, check, and commit

- Remove temporary fixtures.
- Run `git diff --check`.
- Stage the grammar source, corpus tests, and all modified generated files.
- With the intended files staged, verify generated-file freshness and the staged
  diff:

  ```sh
  bun run check:generated
  git diff --cached --check
  ```

- Commit using Conventional Commits, for example:

  ```text
  feat: parse operator types
  test: cover polymorphic option types
  fix: preserve call precedence
  ```

- Finish with a clean working tree and report the commit, Quint validation, and
  passing test counts.

### Continuous feature batches

When asked to implement several capabilities without stopping, repeat the full
red/green/commit cycle for each capability. Do not combine all grammar changes
into one commit. Add the complete integration corpus only after the isolated
features are green and committed.
