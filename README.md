# Tree-sitter Quint

A Tree-sitter grammar for the [Quint specification language](https://quint-lang.org/).
The grammar tracks Quint's current ANTLR lexer and phase-one parser through
differential parity checks.

## Development setup

Install [Bun](https://bun.sh/) and a C/C++ compiler, then install the pinned
project dependencies:

```sh
bun install
```

Generate the parser and run the complete test suite:

```sh
bun run generate
bun run test
```

The pinned `@informalsystems/quint` development dependency is the reference
parser used by the parity checks. Set `QUINT_CLI` only when deliberately
comparing against another Quint installation.

## File detection

The Tree-sitter manifest associates this grammar with both `.qnt`, Quint's
standard source extension, and the `.quint` alias. Its language scope is
`source.quint`.

Parse a file from this checkout with:

```sh
bunx tree-sitter parse path/to/spec.qnt
```

## Syntax highlighting

Generic Tree-sitter highlighting lives in `queries/highlights.scm`. Local
scope, definition, and reference resolution lives in `queries/locals.scm`.

Preview highlighting from this checkout with:

```sh
bunx tree-sitter highlight \
  --grammar-path . \
  --query-paths queries/highlights.scm \
  path/to/spec.qnt
```

Highlight tests are ordinary Quint files under `test/highlight/`. Assertions
use Tree-sitter's inline caret and arrow notation:

```quint
module Example {}
// <- keyword
//     ^^^^^^^ module
```

`tree-sitter test` discovers these tests automatically; no separate JavaScript
test harness is required.

## Tests

Run everything with:

```sh
bun run test
```

This command runs:

- Tree-sitter corpus tests from `test/corpus/`.
- Highlight assertions from `test/highlight/`.
- Tokenization parity against Quint's generated ANTLR lexer.
- Syntax-acceptance parity against Quint's phase-one parser.
- Source-spanned parse-structure parity.

Run an individual parity layer with:

```sh
bun run test:tokens
bun run test:syntax
bun run test:structure
```

After changing `grammar.js`, regenerate the committed parser sources and check
that they are current:

```sh
bun run generate
bun run check:generated
```

The detailed red/green grammar-development workflow is documented in
`AGENTS.md`.
