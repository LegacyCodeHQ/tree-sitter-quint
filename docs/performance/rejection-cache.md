# Reuse confirmed syntax rejection for unfinished buffers

Baseline: `17a33c8`. Artifacts: `/private/tmp/quint-rejection-cache-20261030`.
This extends the [accepted-result cache](recognition-cache.md).

## Red test and change

The real-runtime lifecycle test removes the final brace from 512 definitions,
parses the unfinished document, destroys that parser, and parses an equal-kind
version with a changed comment prefix using a fresh parser. It previously made
249 scanner allocations and requested 16,572,816 bytes. The new budget of fewer
than 64 allocations failed first; the candidate takes 24 allocations and
414,152 requested bytes. Both trees remain malformed.

A complete token-kind sequence determines rejection as well as acceptance, but
an allocation failure does not prove rejection. The recognizer now reports its
resource-failure flag separately from its existing boolean result. A failed
boundary collection also sets this flag. Only a completed recognition with no
full derivation can populate the rejection cache. Failed lexing is not cached.

A separate slot stores at most 65,536 rejected token kinds. This keeps the
accepted boundary entry available when the user restores a closing brace.
Both slots use the same nonblocking C11 atomic flag and exact full-key matching,
including EOF. No source strings, pointers or byte ranges are retained. A cached
rejection leaves zero boundaries and returns the original false recognition
result, selecting the same recovery grammar. Source reading, lexing, source
fingerprinting and position-index rebuilding still happen.

The extra fixed storage is approximately 128 KiB, bringing total cache storage
to approximately 448 KiB plus metadata. Oversized input and contention fall back
to the original work. Unsupported targets and the explicit cache-disable flag
continue to use uncached recognition.

## Failure and concurrency checks

The existing independent oracle checks now exercise both cache entries across
four concurrent document streams, including malformed and complete inputs.
Explicit contention and oversized-entry cases verify both rejection and
acceptance fallback. A rejected entry must not evict the accepted entry needed
for undo.

Failure injection covers all seven allocation sites in a small accepted
recognition, including boundary collection, and all five sites in a small
rejected recognition. Every failure leaves both entries empty; a subsequent
retry must produce the correct result and cache classification. The prior nine
cached-copy failure sites and uncached recognizer's 8/241-site checks still pass.
AddressSanitizer/UndefinedBehaviorSanitizer pass the cache and runtime tests;
ThreadSanitizer passes the concurrent oracle test.

The complete suite passes: 275 corpus cases, 111 parity fixtures, 20 Node/query/
editor/tooling checks, 14 benchmark cases and the 80-case header matrix. The
348-case representative audit and all 54,907 exhaustive cases (8,259 boundary
and 46,648 deep) have zero acceptance, structure or tokenization disagreements;
coverage remains 103/103 alternatives and 68/68 emitted token classes.

All 475 baseline/candidate full-tree captures match, including six edit/undo
transitions and independent fresh parses for every input. This checks named and
anonymous nodes, fields, ranges and error flags, including malformed recovery
trees. Quint 0.33 `parse` and `typecheck` pass all 77 release examples (154
commands). Packed Node/Bun consumers and generated-source checks pass.

Baseline native SHA-256:
`6dc71b22bfab149af57055fc137feee72bd831098aeef9b1cf4ca3f337f5467d`.
Candidate native SHA-256:
`5ef96c55638c4c56aa560834d05bd56bd068e6d904833826ab3545e5b5cd0e46`.

## Ordinary measurements and recheck

Five alternating baseline/candidate pairs per input ran after the correctness
jobs completed, in fresh ordinary Node v26.11.1 workers on Apple M5 Max, macOS
arm64. Full captures, independent fresh parses and baseline comparisons remained
enabled; workers yielded between parses. `measurements.json` preserves input
and binding hashes.

| Workload | Edits per sequence | Median edit sequence, ms |
| --- | ---: | ---: |
| 1,024 definitions, unfinished initializer and missing brace | 8 | 254.35 → 82.68 |
| 512 valid definitions | 10 | 54.39 → 60.03 |
| Unterminated 64 KiB comment | 6 | 46.51 → 46.88 |
| Release ICS20 example | 8 | 45.33 → 41.96 |

A separate five-pair `recheck.json` records 251.35 → 83.71 ms for the incomplete
sequence and 52.36 → 53.43 ms for the valid sequence. Paired median candidate/
baseline ratios are 0.349 and 0.986 respectively; the separate medians reflect
some host drift. There is no broad valid-file or cold-parse speedup claim.
The recheck's initial medians are 32.78 → 34.31 ms for incomplete input and
13.55 → 14.41 ms for valid input. The unterminated-comment control correctly
receives no recognition-cache benefit because tokenization fails first.

The incomplete workload's ordinary worker RSS is higher: 166,624 → 191,392 KiB
in the recheck. Three-round memory interventions (`memory-baseline.json` and
`memory-candidate.json`) give the following peak-RSS medians:

| Diagnostic intervention | Baseline → candidate, MiB |
| --- | ---: |
| Omit tree captures | 102.88 → 102.59 |
| Full captures, forced GC between parses | 119.19 → 118.17 |

The gap disappears under both interventions. This implicates capture/collection
scheduling, but does not isolate production native memory. These are diagnostic
interventions, not ordinary latency measurements; omitted captures are explicitly
labelled. Full-capture output sequences still match. Fixed cache storage grows
by approximately 128 KiB and native allocation work drops as described above.
No general process-memory reduction or CI timing/RSS threshold is claimed.

## Limits

Only a complete, lexable stream with identical kinds can hit. Unterminated
comments/strings still fail during lexing; changed kinds and cache eviction can
require full recognition. This is not incremental ATN evaluation. Whole-file
lexing and the remaining repeated-suffix recovery cost are unchanged.
