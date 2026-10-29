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

All seven original greedy-boundary diagnostic cases now agree with Quint 0.33
and run under `test/fixtures/` and `test/corpus/reference_diagnostics.txt` in the
normal test gate. Their diagnostic kinds and source spans were checked against
the corresponding ANTLR contexts. Semicolon-disambiguated fixtures and complete
local operator headers guard against rejecting valid alternatives. Assignment
RHS regressions also cover multiple subtraction operators before the diagnostic. There is no
separate directory of known failing comparisons.

Repeat the normal acceptance check against a 0.33.0 installation with:

```sh
QUINT_CLI=/path/to/quint-0.33.0 bun run test:syntax
```

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

## Reproducing the Quint 0.33 audit

Install the reference separately so the released package's version contract can
remain unchanged until its next release:

```sh
bun ci
bun ci --cwd test/reference-quint033
bun run test:audit
QUINT_CLI="$PWD/test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js" bun run test
```

The private reference package pins Quint **0.33.0** with its own frozen lockfile.
The audit refuses another compiler version, including the root package's current
0.32 reference. CI uses the 0.33 reference for both the ordinary suite and audit.
No global Quint installation is required.

The generators `scripts/quint-033-cases.mjs`,
`scripts/quint-033-lexical-cases.mjs`, and
`scripts/quint-033-expression-cases.mjs` generate 8,259 deterministic programs
covering headers, local-definition boundaries, comments and line endings, nested
types,
match and lambda forms, nested calls, assignment/subtraction chains, imports
and exports, qualified identifiers, sum variants, and literal/comment boundaries
(including embedded NUL characters and unterminated tokens). Type/row variables
in the additional matrix are bound to keep semantic scope errors separate from
syntax checks. The expression matrix includes every ordered pair of 18 binary
operators in
three contexts, 1,000 recursive expressions from fixed xorshift32 seed
`0x0332026`, and 432 subtraction/local-definition boundary variations. The
runner asserts both the case count and a SHA-256 fingerprint. Deliberate matrix
changes require reviewing coverage and updating that fingerprint.

Every generated case is checked for syntax acceptance against Quint's ANTLR
phase-one parser; accepted cases are also checked for parse structure and token
parity. Rejected cases exercise diagnostics without treating ANTLR recovery trees
as valid structure. These checks compare syntax, not semantic validity or full
typechecking, and are bounded evidence rather than a proof of grammar equivalence.
The ordinary suite additionally retains the curated regression fixtures.

On failure the audit retains generated `.qnt` files, a family/count manifest,
and per-checker logs, and prints the directory and a reproduction command.
Set `QUINT_AUDIT_ARTIFACTS=/path/to/directory` to choose its parent directory.
Successful runs remove only their own temporary subdirectory. CI uploads failed
audit artifacts for seven days. To reproduce a structural or token mismatch,
use `scripts/check-parse-structure-parity.mjs` or
`scripts/check-tokenization-parity.mjs` with the reported case and the same
`QUINT_CLI` environment setting.

The NUL regressions under `test/corpus/nul_characters.txt` and
`test/fixtures/lexical-nul-characters.qnt` intentionally contain literal NUL bytes.
The generated lexer excludes NUL from its character classes, so the external
scanner recognizes NUL-containing strings, comments, and hashbangs. Ordinary
tokens retain their existing generated-lexer behavior and tree node shapes.
Incremental checks cover transitions between ordinary and NUL-containing tokens.

The structure checker converts ANTLR code-point offsets to UTF-16 offsets before
comparing with Node Tree-sitter spans. Emoji in strings, comments, or earlier
source text must not cause spurious structure mismatches.

Subtraction before a local `def` must preserve ANTLR's greedy initializer and its
QNT006 diagnostic; `syntax-greedy-minus-local-definition.qnt` covers both value
and operator initializers. `structure-greedy-minus-semicolon.qnt` guards the
valid semicolon-disambiguated alternatives, which parse and typecheck in Quint.
Incremental tests insert/remove those semicolons.

Record expressions in the generated syntax matrix contain at most one spread.
ANTLR's grammar accepts multiple spreads, but its frontend rejects them with
QNT012. Like unbound row/type variables, this validation remains a compiler
responsibility; the Tree-sitter grammar follows the ANTLR syntax for record
fields and spreads.
