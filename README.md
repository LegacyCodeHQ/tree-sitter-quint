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

## Node.js usage

Install the Tree-sitter runtime and Quint grammar:

```sh
npm install tree-sitter @legacycodehq/tree-sitter-quint
```

Parse Quint source with the grammar:

```js
import Parser from "tree-sitter";
import Quint from "@legacycodehq/tree-sitter-quint";

const parser = new Parser();
parser.setLanguage(Quint);

const tree = parser.parse("module Example {}");
console.log(tree.rootNode.toString());
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

## Releasing

Keep the version synchronized across the generated language manifests with
Tree-sitter's version command, commit the result, and create a matching `v*`
tag. Pushing the tag runs the npm release workflow:

```sh
bunx tree-sitter version 0.32.0
git tag v0.32.0
git push origin v0.32.0
```

The workflow verifies the tag and manifest versions, runs the complete release
gate, and publishes `@legacycodehq/tree-sitter-quint` with npm provenance. The
npm package must designate `.github/workflows/release.yml` in
`LegacyCodeHQ/tree-sitter-quint` as a trusted publisher before the tag is
pushed.

The grammar version tracks the supported Quint compiler release exactly. The
npm development dependency pins that compiler version, and the release check
requires every binding manifest and release tag to match it.

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE).

Copyright (c) 2026-present, Legacy Code Headquarters (OPC) Private Limited. All
rights reserved.
