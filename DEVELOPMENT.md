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

The phase-one reference parser also reports some semantic errors, such as
unbound row variables. The full `quint parse` command additionally resolves
imports and names, and `quint typecheck` checks types and effects. A parity
disagreement therefore needs investigation before treating it as a grammar
defect. For example, phase one accepts `Set[int, bool]` as a generic type
application, but the full compiler rejects it.

The grammar retains editor tolerance for empty buffers and for line comments,
documentation comments, and a hashbang ending at EOF. Quint's file grammar
requires at least one module and a terminating newline for those line tokens.
These existing editing allowances are separate from support for valid compiler
input. Semantic constraints such as bound type variables remain compiler checks.

Documentation comments belong before modules or declarations, rather than inside
expressions. Like the ANTLR lexer, line comments, documentation comments, and
hashbangs run through carriage returns until LF or the retained EOF allowance.

After changing `grammar.js`, regenerate the committed parser sources and verify
that they are current:

```sh
bun run generate
bun run check:generated
```

## Quint 0.33 audit and remaining diagnostic differences

The grammar has also been checked against the exact upstream `v0.33.0` release
(`d7ef819575c1ebcad7ba11018ce6c64377cfbe3c`). Its ANTLR grammar and generated
parser are unchanged from `v0.32.0`. Validation includes the release's 77 example
files with both `quint parse` and `quint typecheck`, and differential acceptance
and source-spanned tree checks on generated expressions and local definitions.
The pinned development compiler and package versions still target 0.32.0;
use `QUINT_CLI` to repeat the checks with a 0.33.0 installation.

The grammar represents ANTLR diagnostics with named nodes. In particular,
`invalid_identifier` preserves QNT008 for reserved words in expressions,
`invalid_equality_expression` preserves QNT006 for a standalone `=`, and
`invalid_map_type` marks the legacy two-argument Map type. These nodes can occur
in a tree whose `hasError` is false: consumers checking language acceptance must
check these diagnostic nodes as well as Tree-sitter's `ERROR` and missing nodes.
The syntax parity checker does this, and reserved identifier diagnostics receive
error highlighting. The greedy-call reserved-word regressions are part of the
normal fixture and corpus suites, including the semicolon-disambiguated form.

Five original malformed-input cases still await individual promotion into the
normal regression suite and are retained under
[`test/known-reference-differences/`](test/known-reference-differences/).
ANTLR greedily continues an initializer as a call and then diagnoses an
unexpected `=` (QNT006). Tree-sitter can find an earlier binding boundary that
produces a syntax tree without an error. These are diagnostic regression cases, rather than supported Quint examples. They are outside
`test/fixtures/`, whose parity checks must pass. Reproduce the known failing
comparison explicitly with:

```sh
QUINT_CLI=/path/to/quint-0.33.0 \
  node scripts/check-syntax-acceptance-parity.mjs test/known-reference-differences
```

This command currently reports two disagreements and exits unsuccessfully; the
other three already agree after the shared QNT006 fix.
Use the Quint compiler to determine validity; an error-free editor tree alone
does not establish that a program is accepted by Quint.

## Parsing locally

The Tree-sitter manifest associates the grammar with `.qnt` and `.quint` files
under the `source.quint` scope. Parse a file from the checkout with:

```sh
bunx tree-sitter parse path/to/spec.qnt
```

## Syntax highlighting

Reusable editor queries live under `queries/`. Highlighting rules are in
`highlights.scm`, local definitions and references are in `locals.scm`,
matching delimiter pairs are in `brackets.scm`, and syntax-driven indentation
rules are in `indents.scm`. The `outline.scm` query exposes modules and
declarations to editor symbol outlines. Preview highlighting with:

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
