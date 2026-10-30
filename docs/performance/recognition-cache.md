# Reuse recognition by complete token-kind sequence

Baseline: `ef5fd54`. Artifacts: `/private/tmp/quint-content-cache-20261030`.
This follows the [scanner lifecycle investigation](incremental-recognition.md).

## Red test and cache lifetime

A fresh runtime parser previously made 271 scanner allocations (16,703,196
requested bytes) after another parser had parsed the same token-kind sequence.
The real-runtime test destroys the first tree and parser before creating the
second; a payload-local cache cannot pass it. The new work budget of fewer than
64 allocations failed first. It now takes 39 allocations and 466,812 requested
bytes, including retokenization and rebuilding source-position indexes.

The recognizer consumes token kinds and emits token-index boundaries. It does
not consult identifier/literal bytes or token byte offsets. Consequently,
recognition results are reusable across different documents if **every token
kind, including EOF, matches in order**. No document identity is required.
The scanner still reads and tokenizes the entire current source, then refreshes
its fingerprint, offsets, stacks and indexes. Cache hits cannot preserve old
source ranges or weaken the initial guard's dependency on the whole file.

The single entry has process/library lifetime and fixed storage: 65,536 token
kinds and 16,384 boundaries, approximately 320 KiB plus count metadata. It holds
no source strings, document pointers or heap allocations. Larger results bypass
storage. Only successful complete recognition is stored. Failed lexing, changed
kinds and cache misses perform the original work; rejected recognition is never
cached. A missing closing brace therefore remains an expensive case.

A C11 atomic flag protects the complete entry. Contending readers and writers
fall back immediately to normal recognition rather than wait. Lookup, exact key
comparison and result copying happen under the flag. Recognition itself happens
outside it. Cached-copy allocation failure releases the flag and reports failure
without retaining partial success. The original uncached entry point remains
available as an independent test oracle.

The cache is disabled for WebAssembly, Emscripten, MSVC, pre-C11 compilers and
implementations without C11 atomics. `Q_DISABLE_RECOGNITION_CACHE` also selects
the original implementation. Both enabled and disabled paths are tested. This
change does not claim a WebAssembly editor speedup.

## Correctness checks

The native tests compare acceptance, every token's kind/range, and every boundary
against uncached recognition. Cases include equal-kind documents with different
lengths and offsets; changed operators, semicolons, documentation tokens and
qualified identifiers; local initializer continuations; reserved-name diagnostic
paths; incomplete braces, strings and comments; embedded NUL; and empty input.
Four concurrent threads run these comparisons with competing document streams.
An explicitly held cache lock exercises immediate fallback, and oversized-entry
checks verify capacity bypass. All nine cached allocation failure sites clean up
and leave the cache reusable. Existing recognizer allocation failure tests still
exercise the uncached path.

AddressSanitizer and UndefinedBehaviorSanitizer pass the cache and real-runtime
reuse checks. ThreadSanitizer passes the concurrent cache test. The serialization
format, grammar, generated parser, reference ATN, node schema and queries are
unchanged.

The regular suite passes: 275 corpus cases, 111 curated parity fixtures, 20
Node/query/editor/tooling checks, 14 benchmark cases and the 80-case header
matrix. The 348-case representative audit and all 54,907 exhaustive cases
(8,259 boundary plus 46,648 deep) have zero acceptance, structure or tokenization
disagreements. Coverage remains 103/103 alternatives and 68/68 token classes.

Full baseline/candidate tree captures match on all 475 inputs: the corpus,
fixtures, 77 release examples and 12 malformed repetition inputs. Each also
passes six edit/undo transitions and independent fresh-parser comparisons.
These include all anonymous nodes, fields, ranges and error flags. The baseline
binding is independent of the candidate cache, so a shared cache cannot hide a
stale result behind a supposedly fresh candidate parse. Quint 0.33 `parse` and
`typecheck` pass all 77 release examples (154 commands). Packed Node/Bun smoke
tests and generated-source freshness checks pass.

Baseline native SHA-256:
`bf6999d59b25fbd09cfebccf648959a9fb82fa06f70ef56f2d389f6d77f513a1`.
Candidate native SHA-256:
`6dc71b22bfab149af57055fc137feee72bd831098aeef9b1cf4ca3f337f5467d`.

## Ordinary measurements

After the correctness jobs completed, five alternating pairs per workload ran
in fresh Node v26.11.1 workers on Apple M5 Max, macOS arm64. Workers used ordinary
bindings, yielded between parses, and verified full tree captures against fresh
parses and the baseline. `measurements.json` retains the source/binding hashes.
The earlier `pilot.json` overlapped correctness work and is not timing evidence.

| Workload | Edits per sequence | Median complete edit sequence, ms |
| --- | ---: | ---: |
| 512 definitions | 10 | 130.58 → 55.07 |
| 4,096 definitions | 10 | 2,663.78 → 872.27 |
| 256 identical definitions | 10 | 114.80 → 50.41 |
| 1,024 definitions, missing brace | 8 | 522.96 → 496.80 |
| Release ICS20 example | 8 | 109.41 → 46.66 |

Sequences include comments, renames, literal edits and undo, plus missing-brace
and changed-operator transitions where applicable. Misses remain expensive:
the 4,096-definition operator edit takes 243.03 → 250.40 ms, while the module
rename takes 240.06 → 24.31 ms. The incomplete-buffer control has no intended
cache benefit. Initial parses have no prior cache entry; their varying timings
do not establish a cold-parse improvement.

Native requested allocations fall sharply on hits, but this is not a claim that
process peak RSS falls. Full-worker RSS includes Node, captures and allocator
retention; the 4,096-definition median is 460,032 → 479,184 KiB. The cache adds
fixed native storage as described above. No elapsed-time or RSS threshold is
used as a CI correctness test.

## Limits

This reuses a complete recognition result when token kinds stay identical. It
is not incremental ATN evaluation for arbitrary edits. Every edit still requires
whole-source reading, lexing and fresh source indexes. A changed token kind,
rejected input, oversized result, or competing cache entry can require the full
recognizer. Identical suffixes during error recovery remain a separate cost,
even with the preceding [recovery filter](recovery-filter.md).

The [confirmed-rejection follow-up](rejection-cache.md) extends this experiment
with a separate bounded entry for unfinished but lexable buffers. It reports
allocation failures independently so they cannot be cached as syntax rejection.
