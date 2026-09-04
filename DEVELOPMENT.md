# Development

## Development setup

Install [Bun](https://bun.sh/) and a C/C++ compiler, then install the pinned
dependencies:

```sh
bun install
```

Generate the parser and run the complete test suite:

```sh
bun run generate
bun run test
```

The pinned `@informalsystems/quint` dependency provides the reference ANTLR
lexer and phase-one parser used by the parity checks. Set `QUINT_CLI` only when
deliberately comparing against another Quint installation.

The detailed red/green workflow for grammar changes is documented in
[AGENTS.md](AGENTS.md).

## Testing

`bun run test` runs:

- Tree-sitter corpus tests from `test/corpus/`.
- Highlight assertions from `test/highlight/`.
- Tokenization parity against Quint's generated ANTLR lexer.
- Syntax-acceptance parity against Quint's phase-one parser.
- Source-spanned parse-structure parity.
- The Node.js binding test.

Run an individual parity layer with:

```sh
bun run test:tokens
bun run test:syntax
bun run test:structure
```

The parity scripts also accept directories and recursively check every `.qnt`
file. Use them to compare the grammar with a local Quint checkout:

```sh
node scripts/check-tokenization-parity.mjs --quiet /path/to/quint
node scripts/check-syntax-acceptance-parity.mjs --quiet /path/to/quint
node scripts/check-parse-structure-parity.mjs --quiet /path/to/quint
```

After changing `grammar.js`, regenerate the committed parser sources and verify
that they are current:

```sh
bun run generate
bun run check:generated
```

## Parsing locally

The Tree-sitter manifest associates the grammar with `.qnt` and `.quint` files
under the `source.quint` scope. Parse a file from the checkout with:

```sh
bunx tree-sitter parse path/to/spec.qnt
```

## Syntax highlighting

Reusable editor queries live under `queries/`. Highlighting rules are in
`highlights.scm`, local definitions and references are in `locals.scm`, and
matching delimiter pairs are in `brackets.scm`. Preview highlighting with:

```sh
bunx tree-sitter highlight \
  --grammar-path . \
  --query-paths queries/highlights.scm \
  path/to/spec.qnt
```

Tree-sitter discovers the assertions under `test/highlight/` when running
`tree-sitter test`.

## Releasing

Package versions match the supported Quint compiler release. Update every
binding manifest and the pinned compiler with:

```sh
bun run version:set -- X.Y.Z
```

For a release candidate targeting an existing stable Quint version, pass both
versions:

```sh
bun run version:set -- X.Y.Z-rc.1 X.Y.Z
```

Commit and push the synchronized manifests, wait for CI, then create and push a
matching annotated tag:

```sh
git tag -a vX.Y.Z -m "Release X.Y.Z"
git push origin vX.Y.Z
```

The tag workflow runs the complete release gate, publishes the npm package with
provenance, and creates a GitHub Release with generated notes. Prereleases use
npm's `next` tag and are marked as GitHub prereleases; stable releases use
`latest`.

Before releasing, npm must designate `.github/workflows/release.yml` in
`LegacyCodeHQ/tree-sitter-quint` as a GitHub Actions trusted publisher with
`npm publish` permission.
