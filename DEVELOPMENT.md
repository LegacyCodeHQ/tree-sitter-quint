# Development

## Development setup

Install [Bun](https://bun.sh/) and a C/C++ compiler, then install the pinned
dependencies:

```sh
bun install
bun ci --cwd test/reference-quint033
export QUINT_CLI="$PWD/test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js"
```

Generate the parser and run the complete test suite:

```sh
bun run generate
bun run test
```

The separate locked 0.33.0 package provides the reference ANTLR lexer and
phase-one parser. Keep `QUINT_CLI` set to it while working on 0.33 compatibility;
the root dependency and release metadata remain on the previous release until
release preparation. Both CI and the release gate install and select this
reference explicitly.

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
bun run test:audit:deep
QUINT_CLI="$PWD/test/reference-quint033/node_modules/@informalsystems/quint/dist/src/cli.js" bun run test
```

The private reference package pins Quint **0.33.0** with its own frozen lockfile.
The audit refuses another compiler version, including the root package's current
0.32 reference. CI uses the 0.33 reference for the ordinary suite and both audits.
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

The separate `test:audit:deep` matrix uses
`scripts/quint-033-deep-cases.mjs` to generate 46,000 expressions at
depths two through five, from fixed xorshift32 seeds `0x3311001`, `0x3311002`,
`0x3311003`, `0x33ab001`, and `0x33ab002`. It combines all local-definition qualifiers with arithmetic,
Boolean and temporal operators, assignments, destructuring, matches, lambdas,
postfix operations, spreads, qualified names, Unicode, and NUL strings. The two
matrices contain **54,907 programs** in total, including 648 ordered operator
pairs through local-header and parenthesized local bodies. The deep audit includes every
generated source, including rejected inputs that agreed during discovery.
The 20,000 cases from the last two seeds were an independent holdout before
being added to the permanent audit. It has its own case-count and SHA-256
fingerprint checks.

Every generated case is checked for syntax acceptance against Quint's ANTLR
phase-one parser; accepted cases are also checked for parse structure and token
parity. Rejected cases exercise diagnostics without treating ANTLR recovery trees
as valid structure. These checks compare syntax, not semantic validity or full
typechecking, and are bounded evidence rather than a proof of grammar equivalence.
The ordinary suite additionally retains the curated regression fixtures.

On failure the audit retains generated `.qnt` files, a family/count manifest,
and per-checker logs, and prints the directory and a reproduction command.
The manifest records a fingerprint of the generated parser, scanner, recognition
tables, node schema, and native binding. An audit fails if that implementation
changes between checker layers, preventing mixed-snapshot results.
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

## ANTLR production coverage

`bun run test:coverage` uses the locked 0.33 compiler, the generated audit
matrices, and `test/fixtures` to require a witness for every file-reachable ANTLR
parser alternative and emitted lexer token class. It currently covers **103/103
alternatives and 68/68 token classes**. Only the three REPL-only entry rules
(`declarationOrExpr`, `operator`, `literal`) and lexer-skipped whitespace/comments
are excluded. Ordinary alternatives require a witness without parser diagnostics;
the four explicit diagnostic alternatives require rejection witnesses instead.

The `test:audit` gate runs this check and retains a JSON witness report with
failed audit artifacts. `syntax-wrong-type-application.qnt` exercises QNT009;
`integration-reference-production-witnesses.qnt` covers abstract type declarations
and `any` actions. The latter program parses and typechecks with Quint 0.33.
Production coverage establishes which alternatives were exercised; it does not
prove equivalence for every combination or replace the structural comparisons.


## Reference definition boundaries

ANTLR resolves local definitions with greedy, context-sensitive lookahead. A
Tree-sitter dynamic-precedence score adds preferences across a whole parse;
credits from a later local body can outweigh an earlier initializer. Retaining
more competing grammar productions also runs into Tree-sitter's bounded number
of live parse versions.

The external scanner records canonical declaration and local-definition
boundaries before Tree-sitter selects its expression productions. Its C11
recognizer interprets tables generated from the exact 0.33.0 ANTLR ATN. It keeps
the first ordered derivation for each possible end position and chooses the
first complete parse. It constructs no replacement public syntax tree and
performs no typechecking. The grammar still produces the existing named nodes,
fields, and diagnostic nodes. The structure checker compares local definition
and formal-parameter spans in addition to expression and type spans.

Regenerate or verify the reference tables with the locked compiler installed:

```sh
bun run generate:reference
node scripts/generate-reference-atn.mjs --check
```

`check:generated` verifies these tables as well as Tree-sitter's generated files.
The reference generator rejects any version other than 0.33.0. The scanner
headers are shipped in the npm, Cargo, and Python source packages; no ANTLR
runtime is required by consumers.

The scanner's initial zero-width token reads through EOF. An edit anywhere in
the source invalidates the boundary cache; scanner serialization includes the
source fingerprint and an interned stack ID. This trades some incremental work
for correct boundaries: edits currently recompute recognition for the whole file.
The recognizer uses an explicit work stack rather than recursive C calls, and
scanner serialization does not impose a fixed definition-nesting depth.

When raw syntax recognition fails, the grammar selects its unguarded recovery
rules. Those rules are derived from the same rule functions, with aliases
preserving public node names and shared lexical tokens preserving error leaves.
Incomplete editor buffers therefore retain Tree-sitter recovery instead of
requiring a complete compiler-valid file. Raw ANTLR diagnostic productions such
as unexpected equality remain on the guarded path so their greedy boundary
choices and diagnostic nodes are preserved.


## Grammar layout

`grammar.js` defines the language productions. Operator headers share parameter
and return-annotation tails across qualifiers, and every expression context uses
the same expression rules, including local initializers and local bodies.
Definition-boundary markers provide the required lookahead without duplicating
operator precedence or adding continuation scores for each local context.

`grammar/definition-boundaries.js` applies the hidden markers and derives the
unguarded recovery rules from those same productions. Keep these transforms
separate from the language rules. Changes to either file require regeneration;
the Make and CMake targets track both inputs, and Cargo includes the helper in
its source package. Existing corpus trees and source-spanned parity checks guard
the public nodes and fields during refactoring.

For an independent depth holdout, call
`generateDeepCases([[0x33ac001, 10000]], 3)` and write the returned sources into
a temporary directory for the three parity checkers. This produces depths three
through six; its source-array fingerprint is
`3cbb2ba5b1d2971dac8a82d620087287b22329abb34b45098126fdfdad0899cb`.
The refactor was also checked against this separate 10,000-case holdout, with
zero syntax, structure, or tokenization disagreements. It is additional evidence,
separate from the fixed CI matrices.

## Performance tuning

Follow the [boundary-position performance workflow](docs/performance/boundary-position.md):
freeze an ordinary native baseline, identify repeated work, preserve exact trees
and editor behavior, then compare alternating process runs and native memory.
`bun run benchmark:parser --baseline-binding FILE --output FILE` records paired
measurements; `bun run test:scanner` enforces the deterministic lookup-work
budget without putting elapsed-time thresholds in CI. Whole-file reference
recognition still runs after edits.
