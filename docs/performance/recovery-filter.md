# Reject impossible recovery markers before locating source positions

Baseline: `445c9a6`. Artifacts: `/private/tmp/quint-recovery-20261030`.
This follows the recovery profile in [memory-investigation.md](memory-investigation.md).

## Failing work budget and change

With 128 repeated definitions and a reserved-name error at the beginning,
recovery performed 636 position lookups and 886,902 scanner reads. The new native
test failed its budget of fewer than `2 * definitions + 16` recovery lookups
before changing the scanner. It now records 126 lookups and 180,274 reads.

The filter only runs after Tree-sitter has entered recovery and the reference
recognizer accepted the raw syntax. A begin marker must map to a reference
boundary start of its allowed kind; an end marker must map to an allowed end
of the current stack frame. If the current character cannot occur at any such
position, both original marker operations would fail, so the scanner can return
false without the expensive position lookup.

This is a negative filter. A possible character always goes through the old
exact lookup and stack/boundary checks. It never treats a repeated prefix as
proof of the current absolute position, never resets the conservative recovery
flag, and never changes the recovery grammar.

The position lookup maps byte offsets to the first token whose end follows
that offset. Consequently, the filter must include the **entire target token
and its leading skipped text**, not just the token's first character. Recovery
can enter a token at an interior position or before skipped comments. The
documentation-comment prefix adjustment extends the checked range as well.
UTF-8 leading-byte membership deliberately permits false positives; EOF also
retains the original lookup. Neither can introduce a false rejection.

Begin-character sets are lazily cached by boundary kind. End-character sets
cache one token/prefix pair. Both are derived from the current document, are
invalidated when it changes, and need no serialized state: GLR can query any
frame against the same immutable document. On arm64, `QScanner` grows from 176
to 296 bytes. There are no new heap allocation sites, and the 16-byte scanner
serialization format is unchanged. Normal valid parsing bypasses the filter.

## Native work checks

The real-runtime test covers 128 and 512 definitions, on one line and separate
lines, with the malformed name at the beginning, middle and end. The unchanged
position oracle still verifies every lookup that is performed.

| Case | Recovery lookups | Scanner reads |
| --- | ---: | ---: |
| 128, one line, error first | 636 → 126 | 886,902 → 180,274 |
| 128, one line, error middle | 316 → 62 | 220,342 → 47,218 |
| 512, separate lines, error first | 2,557 → 511 | 14,371,401 → 2,894,341 |
| 512, separate lines, error middle | 1,277 → 255 | 3,589,193 → 734,213 |
| 512, separate lines, error last | 1 → 0 | 15,897 → 15,897 |

The standalone position test checks that the filter permits every boundary
the original lookup could match, including interior-token positions, Unicode,
NUL, skipped text and documentation prefixes. Source replacement exercises
cache invalidation. Existing allocation/retry tests remain unchanged in count.
AddressSanitizer and UndefinedBehaviorSanitizer pass position and recovery tests.

## Compatibility

- 275 corpus tests, 111 curated parity fixtures, 20 Node/query/editor/tooling
  checks, 14 benchmark cases, and the 80-case header matrix pass.
- The representative 348-case audit and both exhaustive matrices pass: 8,259
  boundary and 46,648 deep cases, with zero acceptance, structure or tokenization
  disagreements. Coverage remains 103/103 alternatives and 68/68 token classes.
- Exact full baseline/candidate captures match for all 475 inputs: 275 corpus
  cases, 111 fixtures, 77 release examples, and 12 malformed repetition cases.
  Each also passes six edit/undo transitions and independent fresh-parser
  comparisons, including anonymous nodes, fields, ranges and error flags.
- Quint 0.33 `parse` and `typecheck` pass on all 77 release examples: 154
  commands, zero failures. Packed Node and Bun consumers pass.

The grammar, generated parser, reference ATN, node schema and queries are
unchanged. The baseline native SHA-256 is
`2955b77e9c319035fc9b9ec7edb80f27dd0bff0d847805ca5ecd72d910bf8e50`.
The candidate native SHA-256 is
`bf6999d59b25fbd09cfebccf648959a9fb82fa06f70ef56f2d389f6d77f513a1`.

## Ordinary measurements

Five alternating baseline/candidate pairs per input ran in fresh Node v26.11.1
workers on Apple M5 Max, macOS arm64. Workers yielded between parses and checked
complete tree digests after every edit and independent fresh parse. These runs
used ordinary bindings, without the native diagnostic counters. Inputs and
bindings remained frozen; schema-3 reports retain their hashes.

| Malformed repeated input | Initial median, ms | Edit median, ms |
| --- | ---: | ---: |
| 128, separate lines, error first | 58.75 → 18.09 | 59.10 → 16.92 |
| 512, separate lines, error first | 805.66 → 179.37 | 805.23 → 177.96 |
| 512, separate lines, error middle | 211.41 → 55.20 | 209.55 → 53.60 |
| 512, separate lines, error last | 14.72 → 14.09 | 12.83 → 12.80 |

The report is `measurements.json` in the artifact directory. Its valid ICS20
control has a 12.56 → 12.54 ms edit median. Full-worker peak RSS includes tree
captures and JavaScript allocations, so it does not isolate native memory.
No timing or RSS threshold is added to CI.

A separate five-pair valid-file control (`controls.json`) records edit medians
of 13.99 → 12.82 ms for 512 definitions, 190.15 → 192.15 ms for 4,096 definitions,
and 5.33 → 5.34 ms for 256 identical definitions. This provides no broad valid-
file speedup claim. The 4,096-definition worker RSS is noisy and higher for the
candidate (367,424 → 416,912 KiB medians); the fixed scanner-size increase is
120 bytes, but these captures do not isolate the cause of the process peak.

## Limits

Identical surviving header prefixes can still require reading to EOF. The
512-definition read count remains roughly sixteen times the 128-definition
count, so this does **not** make recovery lookup linear. It removes most
irrelevant lookups on the tested malformed workload without changing its
visible error tree. Whole-file recognition after edits remains a separate cost.
