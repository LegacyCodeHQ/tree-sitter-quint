# Whole-document guard locality experiment

This follows the [boundary/stack index optimization](boundary-stack-index.md).
The production guard and all existing trees are preserved. A temporary ordinary
LR grammar prototype was rejected; this work does not claim incremental
reference recognition or a recovery performance improvement.

Artifacts: `/private/tmp/quint-index-20261030`.

## Prototype and compatibility gate

The comparison with other Tree-sitter grammars suggested moving syntax choices
into grammar rules and retaining scanners for narrowly scoped tokens. To test
that direction, a temporary checkout of `60ba4ae` removed the boundary wrapper
and its duplicate recovery conflicts. The underlying expression/definition
rules were unchanged. No grammar or generated parser from that checkout ships.

Before changing the prototype grammar, the exact existing
`structure-indexed-local-body.qnt` fixture was copied to
`/private/tmp/quint-local-guard-20261030.qnt` and accepted by the Quint 0.33 CLI's
`parse` command. This is syntax evidence, not a typechecking claim.

The prototype generated successfully but failed **52 of 273** existing corpus
expectations. A separate native comparison also finds 52 changed named trees;
all 52 had no Tree-sitter error in the production baseline. Some fixtures
deliberately represent Quint diagnostics, so error-free Tree-sitter trees do
not imply that the compiler accepts every program. The changed cases include
greedy local initializer boundaries and retained diagnostic paths. Static
precedence in the existing rules is insufficient by itself.

Logs: `prototype-generate.log`, `prototype-corpus.log`,
`prototype-differences.json`. The prototype's generated files are retained in
`local-grammar/`, and its diagnostic native binding is `local-grammar.node`.
Neither is used for the indexing performance measurements.

## A cross-module dependency

The more specific module-local approach also needs an additional correctness
condition. Start with the compiler-parsed fixture:

```quint
module IndexedLocalBody {
  pure val seed = 1
  pure def result = {
    val saved = 1
    -def later() = 1
    seed[0]
  }
}
```

Append only this text, after the complete first module:

```quint
module Broken {
```

The first module's text has not changed, but its existing tree must change:

- In the complete document, the guarded grammar gives the nested operator a
  `name_reference` body (`seed`), leaving `[0]` as a `list_literal` body of the
  enclosing local definition.
- With the unfinished second module, whole-document recognition rejects the
  input and selects the recovery grammar. The earlier operator body becomes
  `index_expression` (`seed[0]`), and the enclosing local body contains a missing
  identifier. The first module itself now has an error.

`global-switch.json` retains both full source strings and named trees. This
demonstrates an actual nonlocal dependency in the current tree contract. It
does not prove that all faster implementations are impossible. It does rule
out independently classifying each module and always retaining the tree of an
unchanged earlier module.

The new Node regression edits only the suffix, compares the complete
incremental tree with an independent fresh parser, checks the changed first
module, then removes the suffix and requires the exact original first-module
snapshot. Snapshots include anonymous nodes, fields, byte/point ranges and
error/missing flags. The focused case fails against the unguarded prototype
and passes against the production parser (`guard-red.log`, `guard-green.log`).

## Consequences for a replacement

Two separate behaviors need preservation: the reference parser's greedy local
boundaries and the document-wide choice of recovery grammar. A smaller guard
cannot discard either dependency merely because a declaration or module has
closed. Changes to the global choice can require revisiting earlier modules.

A grammar-based replacement should first reproduce the 52 changed cases with
localized rules/scanner decisions, keeping the current full guard as a
compatibility fallback during experimentation. Eliminating the global choice
then requires a unified recovery design with exact before/after error-tree
checks, or another explicit mechanism to invalidate earlier decisions when
that choice changes. Neither was implemented by this prototype.

Alternatively, incrementally updating the reference recognizer needs a cache
owner that survives real parse calls, stable document identity, and edit-aware
invalidation covering failed-alternative lookahead as well as accepted spans.
The [runtime lifetime investigation](incremental-recognition.md) explains why
scanner-payload caching does not supply that owner on the installed runtime.
Host-owned caching would require integration beyond a portable grammar's
standard scanner ABI.

The next experiment should target one greedy-boundary family and prove both
its grammar equivalence and its lookahead dependency range. The unchanged
module counterexample is now a permanent gate for that work. Existing malformed
recovery lookup and whole-file recognition limitations remain open.
