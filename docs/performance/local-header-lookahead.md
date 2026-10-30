# Local header prediction

This continues the [guard-locality experiment](guard-locality.md). The shipped
grammar and scanner are unchanged. A narrower grammar prototype resolves one
family of boundaries but still fails compatibility elsewhere and during error
recovery; it is not a production optimization.

Base commit: `8d4ae8c`. Artifacts: `/private/tmp/quint-family-20261030`.

## A header whose boundary depends on its enclosing context

These two complete programs are accepted by the Quint 0.33 `parse` command:

```quint
module Header { pure def result = { val outer = val pending () () } }
```

```quint
module Header { pure def result = { val outer = val pending () () () } }
```

In the first program, both units must remain expressions: the inner local
definition needs a body, and the outer local definition also needs a body. The
header ends at `pending`. In the second program, the first `()` belongs to the
header's empty parameter list; the other two units supply the required bodies.
The extra unit appears later than the header decision it changes.

Adding more enclosing initializers moves that distinguishing token farther
away. Instrumenting the pinned ANTLR parser's optional-parameter prediction
(decision 13) measures these maximum token-index distances for the bare `val`
case without an extra unit:

| Enclosing local-expression depth | Prediction distance |
| ---: | ---: |
| 1 | 3 |
| 2 | 4 |
| 8 | 16 |
| 32 | 64 |
| 128 | 256 |

These are observed prediction reads, not wall-clock measurements. The source
family explains why fixed short lookahead is insufficient as nesting grows.
The probe forwards the ANTLR simulator's optional full-context argument when
wrapping `adaptivePredict`, including its recursive calls.

## A focused grammar improvement in the prototype

The unguarded grammar shifts `(` after a value name because
`operatorDefinitionHead` has static right precedence 1. That shift also wins
over reducing a bare value header, even when the following `)` cannot be a
nonempty operator parameter list. A single self-conflict on `value_definition`
is reported as unnecessary and does not retain the lost alternative.

Removing that eager head precedence and declaring these two conflicts instead
lets the parser retain both header choices:

```javascript
[$.value_definition, $._operator_definition_head],
[$._operator_definition_head],
```

This is a finding about the isolated header family. It does not establish that
retaining additional branches is cheap or sufficient for all remaining local
initializer ambiguities.

The initial hidden guard has another observable effect: it anchors the root
node at byte zero, including leading whitespace. The prototype retains a
stateless zero-width initial token, with no lookahead through the document, to
preserve that range. Both comparison variants use this anchor.

Full initial-tree comparisons include anonymous nodes, fields, source ranges,
error/missing flags and child structure:

| Inputs | Unguarded, original head precedence | Revised header prototype |
| --- | ---: | ---: |
| 273 corpus inputs | 52 differences | 38 differences |
| 111 curated fixtures | 55 differences | 41 differences |
| 77 release examples | 11 differences | 11 differences |

No previously matching initial tree becomes different in these 461 inputs.
Fourteen corpus expectations and fourteen fixture trees now match, including
the bare-header/unit case and several retained diagnostic paths. This is not
full compatibility: 38 corpus trees and 11 release-example trees still differ.

The reproducible source-only experiment is
[local-header-prototype.patch](local-header-prototype.patch), relative to
`8d4ae8c`. Apply it only in an isolated temporary checkout, then generate the
parser. It removes the whole-document guard and duplicate recovery rules, so
it deliberately does not satisfy the production tree contract. Use a separate
`XDG_CACHE_HOME` for each experimental checkout; the CLI can otherwise reuse a
cached parser with the same language name from a different checkout.

## Permanent regression matrix and recovery gate

`bun run test:headers` now exercises 80 exact sources: five depths, eight
qualifiers, and the two unit-count variants. All 80 sources passed the actual
Quint 0.33 CLI `parse` command before being added to the matrix. They are syntax
probes with declaration-only headers; no typechecking claim is made.

The checker obtains header ends and parameter choices independently from
ANTLR. It verifies that the two choices differ by exactly three source bytes,
checks growing lookahead on the bare-value cases, and compares incremental
trees with independent fresh parses through insertion, deletion, an unfinished
later module, and undo. The matrix has a pinned count and source fingerprint.

For experimental native bindings, the same checker can compare complete trees
with a frozen baseline:

```sh
node scripts/check-local-header-parity.mjs \
  --binding /path/to/candidate.node \
  --baseline-binding /path/to/baseline.node \
  --report /private/tmp/header-comparison.json
```

An explicit `--valid-only` probe omits recovery transitions and labels that
omission in its report. The original unguarded prototype fails the first valid
case. The revised prototype passes all 80 valid cases, including exact baseline
captures and edit/undo checks, but fails the recovery-inclusive comparison on
the first case. Appending an unfinished later module changes the earlier
header's expected recovery tree. The production parser passes the full gate.

Reports record the matrix fingerprint, individual source hashes, candidate and
optional baseline binding hashes, observed prediction distances, coverage mode,
and failures. Existing reports cannot be overwritten. They are correctness
probes and provide no parser latency or memory measurements.

The complete production suite passes with the new 80-case gate. The shipping
native binding remains byte-identical to the indexed parser
(`2955b77e9c319035fc9b9ec7edb80f27dd0bff0d847805ca5ecd72d910bf8e50`).
The earlier 54,907-case audits still describe that parser; they were not rerun
for this tooling-only change.

## Next boundary family

Most remaining failures involve deciding whether a following minus, call,
index, or Boolean continuation belongs to an initializer or its required local
body. The next useful target is subtraction versus a unary-minus body. The
header experiment shows how to preserve an alternative until enough context
arrives, but each additional conflict needs its own semantic and scaling
checks. Global recovery invalidation remains a separate required gate.
