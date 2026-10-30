# Skip searches across a common suffix prefix

Baseline: `6f0f1c5`. Artifacts: `/private/tmp/quint-recovery-search-20261030`.
This follows the [recovery character filter](recovery-filter.md). Remaining
position lookups still have to distinguish repeated text, but their per-byte
binary searches need not repeat when the candidate interval cannot change.

## Red test and shortcut

The real-runtime recovery test now counts binary-search probes only while the
scanner is recovering. The new budget requires fewer than twice the scanner
read count. It fails on the baseline's first malformed 128-definition case,
while the existing absolute-position oracle still checks every lookup. All 12
cases cover 128/512 definitions, one/separate lines, and early/middle/late errors.
The counter is a compile-time test hook and adds no production state.

At every point in `q_locate_source`, the current suffix-array interval shares
the consumed prefix. Since the array is lexicographically sorted, next bytes
are ordered within that interval. If both endpoint bytes equal the lookahead
byte, every interior byte must equal it as well. Both binary searches would
therefore return the same interval. The number of candidates inside the fixed
position window also cannot change, so its repeated ambiguity check can be
skipped. The scanner still consumes the same next character.

When either endpoint differs, the original searches and uniqueness check run.
No source position is guessed and no recovery-state constraint is weakened.
The same argument applies to each byte of UTF-8. A standalone property check
exercises every containing source window for repeated-prefix, embedded-NUL and
Unicode strings. Existing all-offset and real-runtime position oracles remain
in place. Lookahead consumption, marker decisions, stack serialization and
allocation sites are unchanged.

## Deterministic work

The baseline counter build only adds the same diagnostic hooks and disables the
failing new budget assertion; it does not change the lookup algorithm. Counts
are retained in `baseline-counts.log` and `green-final.log`.

| Case | Scanner reads, unchanged | Recovery search probes, before → after |
| --- | ---: | ---: |
| 512, separate lines, error first | 2,894,341 | 47,126,659 → 2,233,496 |
| 512, separate lines, error middle | 734,213 | 11,771,604 → 1,091,836 |
| 512, separate lines, error last | 15,897 | 0 → 0 |

AddressSanitizer and UndefinedBehaviorSanitizer pass the window/position and
real-runtime recovery checks. No extra index or cache allocation is introduced.

The complete suite passes: 275 corpus cases, 111 curated parity fixtures,
21 Node/query/editor/tooling checks, 14 original benchmark inputs, 12 distinct
editor inputs and the 80-case header matrix. All 348 representative cases and
54,907 exhaustive cases have zero acceptance, structure or tokenization
disagreements. Coverage remains 103/103 alternatives and 68/68 token classes.
Full baseline/candidate captures match on all 475 inputs through edits and undo,
including malformed recovery trees and independent fresh-parser comparisons.
Quint 0.33 `parse` and `typecheck` pass all 77 release examples (154 commands).
Packed Node/Bun consumers and generated-source checks pass.

Baseline native SHA-256:
`abcee449ed956b3893de9d5274bf223a333f397674d6a140f3556f6c1317aa89`.
Candidate native SHA-256:
`05ec37d958f3f2f0f986d39ed6b7e4d9ed890c089c32b2665100a76982f68065`.

## Paired ordinary measurements

Five alternating baseline/candidate pairs per input ran after correctness jobs
finished, in fresh Node v26.11.1 workers on Apple M5 Max, macOS arm64. Bindings
had no diagnostic hooks. Workers yielded between parses and checked full tree
captures after every edit and independent fresh parse. `measurements.json`
preserves raw samples, input hashes and both binding hashes.

| Input | Initial median, ms | Edit median, ms | Complete edit sequence median, ms |
| --- | ---: | ---: | ---: |
| 128 repeated definitions, error first | 11.55 → 5.55 | 9.12 → 3.02 | 87.20 → 31.98 |
| 512 repeated definitions, error first | 183.37 → 45.68 | 169.66 → 33.79 | 1,560.94 → 332.86 |
| 512 repeated definitions, error middle | 57.56 → 23.58 | 45.26 → 12.26 | 433.35 → 135.79 |
| 512 repeated definitions, error last | 19.91 → 19.33 | 3.31 → 3.37 | 60.78 → 63.64 |
| 512 valid definitions | 17.71 → 15.70 | 2.37 → 2.31 | 48.42 → 46.16 |
| Release ICS20 example | 15.76 → 14.92 | 4.56 → 4.39 | 44.40 → 42.46 |

Repeated definitions use separate lines. Sequences include comments, renames,
missing braces, literal/operator changes and undo (ten edits, or eight for the
ICS20 example). The main early-error edit median improves about fivefold. The
late-error case performs no recovery suffix searches and has no intended
benefit. No broad valid-file or cold-parse speedup is claimed.

Worker RSS medians for the early 512-definition case are 110,832 → 106,320 KiB;
the late-error control is 118,032 → 117,440 KiB. RSS includes tree captures,
validation and collector behavior, so these are not isolated native-memory
measurements or a general memory-reduction claim. No timing/RSS threshold is
used as a CI correctness test.

## Limits

The scan still reads through identical suffixes to disambiguate positions.
The read count remains quadratic on this adversarial input. This reduces
search CPU per character; it does not claim linear recovery or incremental
whole-file recognition. Cold token-kind changes and cache capacity misses
remain separate costs.
