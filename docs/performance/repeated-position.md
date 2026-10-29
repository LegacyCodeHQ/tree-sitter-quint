# Repeated-text position lookup

Baseline: `8b3b503` (the scaling-workload commit). This follows the paired
measurement and correctness workflow in [boundary-position.md](boundary-position.md)
and addresses the repeated-definition limitation in [scaling.md](scaling.md).

## Mechanism

Identical definitions defeated the global suffix index: each source-position
query distinguished the current occurrence by reading almost to EOF. The real
Tree-sitter runtime made 17,303,978 scanner character reads for 512 identical
`pure val same = 1 + 1` definitions in an 11,284-byte input. The new native
regression test failed against that frozen baseline before changing the scanner.

The scanner now restricts suffix candidates to the current reference-boundary
window. Its serialized state records the last successful marker's token index,
alongside the existing source fingerprint and persistent stack ID. GLR restores
that lower bound together with the stack. Sorted reference marker positions
provide the next upper bound. A definition header must consume its first token
before another marker can follow its begin marker; consecutive declarations
emit their end and next begin at the same token. These two cases exclude the
identical definitions immediately outside the active window.

Inverse suffix ranks allow the existing byte-prefix search to test candidates
inside that window. UTF-8, embedded NUL, documentation prefixes, whitespace and
zero-width token ends retain their existing treatment. The grammar, generated
parser, public node schema and queries are unchanged.

Rejected reference inputs use the original unrestricted index. Once Tree-sitter
enters its all-symbols recovery mode, unrestricted lookup remains enabled for
the rest of that recognition, including when GLR restores an older snapshot.
Skipped tokens cannot safely obey the bounded-window invariant. A changed
source rebuilds the indexes and resets this conservative recovery flag.

The serialized state grows from 12 to 16 bytes. Retaining inverse ranks adds
approximately four bytes per source byte, and sorted marker positions add eight
bytes per reference boundary. Index allocation failures free temporary storage
and can be retried. This does not make whole-file reference recognition
incremental, remove the remaining boundary/stack searches, or bound arbitrary
long repeated expressions within a single window. Malformed-input recovery can
still incur the original repeated-text cost.

## Regression and correctness checks

`bun run test:scanner` checks repeated definitions at 128, 512 and 2,048
repetitions, both on one line and on separate lines. It counts calls through the
real runtime's scanner lexer, including document recognition, and requires fewer
than 64 reads per source byte. The diagnostic compares every position lookup to
the runtime's actual absolute byte cursor, including speculative calls, and
checks zero-width token ends. It also parses all curated fixture files through
that oracle. These hooks exist only in the test executable.

The standalone position contract retains arbitrary-jump recovery checks and
adds serialized-position restoration, invalid-state rejection, and index
allocation failure/retry coverage. AddressSanitizer and UndefinedBehaviorSanitizer
cover the position and real-runtime tests.

Exact baseline/candidate captures must retain every named/anonymous node, field,
range, error/missing flag and child count, including malformed buffers and their
forward/reverse edits. No existing expected tree is changed. The full 0.33
matrices and exact compiler examples remain required gates.

Artifacts for this experiment are under
`/private/tmp/quint-position-20261029`, including the pristine baseline sources
and binding, failing work-budget log, compiler results, full tree captures,
audit outputs and sanitizer executables. Timing results are recorded after
correctness work has finished; diagnostic timings are not ordinary performance
measurements.

## Measurement transport

Two initial batches (`scale-measurements.json` and
`unterminated-recheck.json`) timed out in an unchanged baseline worker on the
unfinished-comment input. A diagnostic reproduction stalled before its first
parse entry. Those incomplete reports are retained and excluded from timing
claims; they do not establish a parser regression.

The benchmark now materializes each input in a temporary file before spawning
workers, instead of sending large payloads through a synchronous stdin pipe.
Reading inputs remains outside the timed regions. Reports record
`inputDelivery: "file"`; the worker retains its stdin fallback for direct use.
Fifty consecutive unchanged baseline workers completed with file input. The
final paired measurements use this transport for both bindings, with unchanged
input hashes, tree captures, fresh-parse comparisons and failure recording.

## Ordinary paired measurements

Apple M5 Max, darwin/arm64, Node v26.11.1, shared host, ordinary release
bindings and warm filesystem caches. Five fresh alternating pairs per input;
no diagnostic hooks are present in either binding. Each worker checks its
incremental trees against fresh parsing, then both bindings must match full
captures exactly. File materialization, capture and fresh checks are outside
the parse timings. RSS includes the entire worker.

Medians from the complete 160-run `final-scale-measurements.json`:

| Input | Initial parse, ms | Edit sequence, ms | Edits | Peak RSS, MiB |
| --- | ---: | ---: | ---: | ---: |
| definitions-512 | 16.16 → 13.64 | 144.15 → 123.70 | 10 | 130.14 → 128.75 |
| definitions-4096 | 249.71 → 224.35 | 2267.29 → 2298.33 | 10 | 691.97 → 697.72 |
| identical-definitions-256 | 215.32 → 6.34 | 1928.19 → 55.41 | 10 | 92.42 → 90.25 |
| incomplete-definitions-1024 | 29.64 → 29.03 | 211.78 → 208.04 | 8 | 208.56 → 208.42 |
| comment-262144 | 29.49 → 29.73 | 291.64 → 295.13 | 10 | 71.17 → 71.38 |
| unterminated-comment-65536 | 8.02 → 8.09 | 46.77 → 46.64 | 6 | 51.70 → 51.78 |
| cosmos/ics20/ics20.qnt | 14.71 → 14.03 | 109.42 → 101.59 | 8 | 122.22 → 120.09 |
| cosmos/ics23/ics23.qnt | 19.55 → 19.05 | 175.19 → 174.87 | 10 | 164.48 → 162.91 |
| cosmos/tendermint/Tendermint.qnt | 15.06 → 15.34 | 131.22 → 127.95 | 10 | 140.86 → 140.67 |

The 256-repetition workload improves about 34× in initial parsing and 35× in
its edit sequence, with no overlap in observed timing ranges. Changes on the
large release examples are modest and their ranges overlap. Long comments
show no improvement: edit medians are about 1–3% higher for complete comments.
The 4,096-unique-definition edit median is about 1% higher, with a large
candidate outlier and overlapping ranges. There is no universal speedup or
memory reduction claim.

Baseline binding SHA-256:
`7ced6f3ac0d14d284c5e3697338f2eb8f7eafaa46f49749bd88d9a1ecf58f0cd`.
Candidate binding SHA-256:
`0f5c60e1416252072d9cae76f83e6a29d85189143767ae66b4ddb727a492fcbe`.

### Larger repeated-text stress case

Three fresh alternating pairs in `final-stress-measurements.json` compare
1,024 identical definitions. All six workers pass exact tree and fresh-parse
checks, including ten edits per worker.

| Input | Initial parse, ms | Ten edits, ms | Peak RSS, MiB |
| --- | ---: | ---: | ---: |
| identical-definitions-1024 | 4286.21 → 35.88 | 38623.28 → 323.09 | 217.17 → 255.48 |

Both latency medians improve about 119×, with no overlap in observed ranges.
The full worker's peak RSS is about 18% higher, also without overlapping ranges
in these three pairs. That worker includes captures and repeated fresh-parser
validation; it is not an isolated parser-memory measurement. A separate
three-pair single-parse diagnostic, without those loops, records median peak
RSS of 78.0 → 77.7 MiB (`parse-only-memory.json`). This indicates workload-dependent
process peaks, but does not isolate the cause of the full-worker increase. The
higher full-worker RSS remains a reported tradeoff; no memory improvement is
claimed.

## Final validation

- 273 corpus parses, 111 curated token/syntax/structure fixtures, 14 Node/query/
  editor checks and all 14 compiler-gated benchmark workloads pass.
- Both permanent matrices pass: 8,259 boundary cases and 46,648 deep cases,
  with zero syntax, structure or tokenization disagreements. The separate
  real-runtime cursor oracle also passes all 54,907 generated inputs.
- Full baseline/candidate captures match for all 273 corpus inputs, 111 curated
  fixtures and 77 release examples, including six forward/reverse edits per
  program and independent fresh-parser checks. Existing error trees are kept.
- Upstream structure checks cover 188 accepted files and 53,608 structures,
  skipping five rejected files, with zero disagreements.
- The exact Quint 0.33.0 compiler passes `parse` and `typecheck` for all 77 release
  examples: 154 commands, zero failures.
- Native work budgets, serialized restoration, 16 index-allocation failure/retry
  sites and ASan/UBSan checks pass. The unchanged recognizer failure checks also
  pass all eight nested and 241 flat allocation sites.
- Generated files are fresh and unchanged. Packed Node and Bun smoke tests pass.
