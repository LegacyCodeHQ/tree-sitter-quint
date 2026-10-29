# Parser scaling and stress workloads

This extends the [performance workflow](boundary-position.md) beyond the three
largest release examples. It follows the [allocation experiment](recognizer-allocations.md)
and the [incremental recognition investigation](incremental-recognition.md).

## Inputs and correctness gates

`scripts/parser-benchmark-cases.mjs` generates compact, deterministic inputs:

- The original 32/128/512-definition and Unicode/local-body cases.
- 1,024 and 4,096 unique definitions, and an incomplete 1,024-definition buffer.
- Identical repeated definitions at 256 and 1,024 repetitions. Duplicate names
  deliberately stress repeated text; these are syntax/editor inputs, not a
  claim of name-resolution/typechecking validity.
- Nested local definitions at depths 16 and 64.
- Complete comments with 64 KiB and 256 KiB of text, and an unfinished 64 KiB
  comment. The unfinished case uses a bounded error span that the locked
  reference runtime reports normally.

`bun run test:benchmark-cases` validates all 14 cases, including the expensive
stress case, with the locked 0.33.0 ANTLR lexer/parser. It checks lexer and parser
errors separately from IR construction or name resolution. Unexpected runtime
exceptions fail the check. Its input fingerprint is
`f813c7a76bca6500624ea9bc86a2cdbc9bf3a870d603016793697ad7df810411`.

`test/scanner/scaling_test.c` checks native allocation growth without wall-time
thresholds. The 1,024-definition input makes 455 allocation requests and requests
32,596,368 bytes; 4,096 definitions make 1,729 requests for 130,488,384 bytes.
Both release every tracked allocation. The budget allows fewer than one native
allocation per definition and less than 40 KiB of cumulative requested storage
per definition. This protects this flat-input scaling family; it is not a
universal bound on arbitrary ambiguous expressions. Normal and ASan/UBSan checks
pass. A shared test-only allocator also serves the existing failure-injection
checks; no counters ship in the grammar.

## Running measurements

```sh
bun run benchmark:parser \
  --baseline-binding /path/to/frozen/baseline.node \
  --candidate-binding /path/to/frozen/candidate.node \
  --scale --examples /path/to/pinned/quint/examples \
  --output /private/tmp/quint-scaling.json
```

`--scale` adds the scaling workloads and extends editor sequences with literal
and operator edits. Prefix comments, module names, missing closing braces,
literals and operators are edited and undone. No-op variants are omitted; each
summary records the actual edit count. Every incremental tree must match a
separate fresh parser, and baseline/candidate captures must agree exactly.
Generated cases also check their expected initial Tree-sitter syntax status.

Reports use schema 2. They retain every timing, input/binary SHA-256, named edit,
node/field/flag/range digest, process CPU and peak RSS. An abnormal worker's exit,
signal, error, stdout and stderr are retained in the failure report. Process CPU
includes startup and captures; parse wall times exclude capture. As before, RSS
includes startup, fresh-parsing checks and captures. A report containing an
infrastructure error is not a successful comparison.

The 1,024-identical-definition case is opt-in with `--stress`; a whole sequence
can take over a minute per worker. `--stress` implies `--scale`. Use `--match`
to select a focused family, for example:

```sh
bun run benchmark:parser \
  --baseline-binding /path/to/frozen/baseline.node \
  --stress --match '^identical-definitions-' --rounds 1 \
  --output /private/tmp/quint-repeated-stress.json
```

The other workloads still run with five alternating ordinary pairs by default.
There is no elapsed-time gate in CI; the reference and native-work checks run
with the ordinary test suite.

## Remaining repeated-text cliff

The source-position index must distinguish a current suffix from every other
matching suffix. For identical repeated definitions that can require reading
through all the later repetitions. A separate native diagnostic counts the work
while checking every token position:

| Identical definitions | Token-position queries | Characters read |
| ---: | ---: | ---: |
| 128 | 901 | 1,260,775 |
| 256 | 1,797 | 5,044,839 |
| 512 | 3,589 | 20,182,375 |
| 1,024 | 7,173 | 80,735,079 |

Doubling repetitions approximately quadruples character reads. These exact work
counts establish the cliff independently of shared-host timing noise. The
allocation arena does not change this lookup algorithm. One correctness pilot
observed roughly 4.3 seconds for the initial 1,024-identical-definition parse
on both versions, compared with under 0.14 seconds for 1,024 unique definitions;
that pilot ran alongside checks and is not used for a speedup claim.

Solving it requires position information the scanner interface does not expose,
or redesigned token/guard placement. Source text alone cannot distinguish
identical suffix prefixes without longer lookahead. Guessing from declaration
order would need proof under GLR backtracking and recovery. The guard/lifetime
requirements are recorded in the incremental investigation; this remains a
known performance limit, not an acceptance or tree-shape disagreement.

Artifacts are retained at `/private/tmp/quint-recognizer-perf-20261029`, including
frozen baseline/arena/final binaries and sources, failure-injection and sanitizer
logs, rejected edit-reuse prototype, exact fixture/example comparisons, repeated
position-work C diagnostic, compiler checks and ordinary measurement JSON.

## Final ordinary measurement batch

Baseline: `69a15c97af80b816e81a42a3db25dd78bab5068c`; candidate production
recognizer: `2476429`, with the subsequent editor/scaling checks and no retained
edit-cache prototype. Five alternating pairs on each of 16 workloads make 160
fresh ordinary processes. Builds, checks and diagnostic runs finished before
this batch. Node 26.11.1, Apple M5 Max, darwin/arm64, shared host, warm caches.
Numbers are medians, and RSS includes capture/fresh-parse checks as described
above. `scaling-final.json` retains all measurements, fingerprints and captures.

| Input | Initial parse, ms | Edits | Edit sequence, ms | Peak RSS, MiB |
| --- | ---: | ---: | ---: | ---: |
| definitions-32 | 2.00 → 1.29 | 10 | 16.29 → 11.37 | 60.5 → 58.5 |
| definitions-128 | 11.19 → 6.10 | 10 | 98.42 → 58.79 | 80.5 → 81.2 |
| definitions-512 | 58.57 → 35.05 | 10 | 512.99 → 333.25 | 153.9 → 138.3 |
| repeated-unicode-comments | 23.68 → 14.63 | 8 | 163.11 → 111.49 | 96.8 → 91.9 |
| definitions-1024 | 128.61 → 82.73 | 10 | 1183.06 → 740.45 | 301.6 → 295.6 |
| definitions-4096 | 717.69 → 486.43 | 10 | 6732.76 → 4599.24 | 840.9 → 736.4 |
| identical-definitions-256 | 248.09 → 249.85 | 10 | 2365.69 → 2373.93 | 103.6 → 109.2 |
| incomplete-definitions-1024 | 86.39 → 57.22 | 8 | 679.65 → 375.94 | 252.0 → 253.6 |
| nested-locals-16 | 0.78 → 0.54 | 8 | 5.14 → 3.00 | 54.2 → 54.2 |
| nested-locals-64 | 2.90 → 1.96 | 8 | 20.84 → 12.60 | 67.1 → 65.7 |
| comment-65536 | 8.36 → 8.17 | 10 | 83.84 → 87.76 | 67.4 → 67.1 |
| comment-262144 | 31.02 → 29.79 | 10 | 304.78 → 299.22 | 76.2 → 76.5 |
| unterminated-comment-65536 | 8.29 → 8.31 | 6 | 47.82 → 48.75 | 53.2 → 52.9 |
| cosmos/ics20/ics20.qnt | 32.26 → 20.39 | 8 | 235.11 → 157.14 | 151.0 → 137.6 |
| cosmos/ics23/ics23.qnt | 89.64 → 52.69 | 10 | 787.06 → 497.22 | 200.5 → 180.0 |
| cosmos/tendermint/Tendermint.qnt | 71.08 → 44.06 | 10 | 629.70 → 408.54 | 162.8 → 142.6 |

The three release examples show 37–41% lower initial parse time, 33–37% lower
edit-sequence time and about 9–12% lower median peak RSS. The 4,096-definition
input reduces initial and edit-sequence time by about 32%, with about 12% lower
median RSS. Compare within this batch rather than combining percentages from
previous runs or the rejected cache experiment.

Identical repeated text shows no latency improvement, and its median RSS is
higher. Long-comment workloads show little change; the 64 KiB comment's edit
median is slightly higher with overlapping observed ranges. These results do
not support a universal speedup or memory reduction. The native allocation
budget and exact repeated-position read counts are separate evidence for the
mechanisms behind those results.

All 160 runs matched baseline/candidate tree captures and incremental/fresh
checks. The 1,024-identical-definition stress input additionally passed the
separate one-pair correctness pilot; that pilot's timings are excluded here.

## Final validation

- 273 corpus parses, 111 curated reference fixtures and 14 Node/query/editor
  checks pass. The new editor test covers six content/recovery transitions for
  each curated fixture using a separate fresh parser for comparison.
- All 14 generated benchmark inputs pass the pinned ANTLR syntax gate, including
  the opt-in stress input. The matrix fingerprint and case count are checked.
- Native position/allocation/scaling budgets pass, including every allocation
  failure site on the 8-site nested and 241-site flat recognition inputs.
  Allocation and scaling checks also pass AddressSanitizer/UndefinedBehaviorSanitizer.
- Full upstream structure parity checks 188 accepted files / 53,608 structures,
  skips 5 rejected files and reports no disagreements.
- The exact 0.33.0 compiler passes `parse` and `typecheck` on all 77 release
  examples: 154 commands, zero failures. Packed Node/Bun smoke tests pass.
- The 54,907-case matrices passed during the discarded reuse experiment, which
  exercised the pooled recognizer through its ordinary fresh-payload path.
  After removing that wrapper, the final shipping source passed the complete
  suite, upstream, compiler, package, sanitizer and paired checks listed above.
