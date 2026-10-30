# Bound recognition reuse across editor documents

Baseline: `8362e5a` (parser unchanged from `503b8c8`).
Artifacts: `/private/tmp/quint-multidoc-20261030`.
The [interleaved editor benchmark](editor-benchmarks.md) exposed eviction when
switching between documents with different token-kind sequences.

## Failing test and storage

A real-runtime work-budget test creates fresh parsers for 2, 4 and 10 documents,
including incomplete versions, and then revisits each with changed comments.
The previous single-entry cache failed immediately: revisiting the first of two
files made 271 scanner allocations. The candidate records 96 warm hits and zero
misses across all groups. Completed documents take 39–41 allocations and rejected
documents take 24; the work budget remains fewer than 64. A diagnostic lookup
before each parse only checks existing entries; it cannot populate a missed key.
All probe allocations are freed before counting scanner work.
The archived baseline with only the failing budget assertions disabled records
zero warm hits and 96 misses for the same three groups (`baseline-counts.log`).

The cache now has a fixed 512 KiB byte pool and at most 64 entries shared by
accepted and confirmed-rejected results. Entries retain complete token kinds
and accepted boundary indices, with no source strings, document pointers or
heap allocations. On arm64 total storage is 526,872 bytes, versus 458,776 for
the preceding two slots: an increase of 66.5 KiB. Per-entry limits remain 65,536
tokens and 16,384 boundaries.

A token-kind hash narrows candidates, but every hit must compare every kind,
including EOF. Accepted boundaries are copied into the current document, whose
ranges come from current-source lexing. Rejections still require a completed
recognition without resource failure. Full-file guard invalidation and scanner
serialization remain unchanged.

Entries are evicted by least recent use until both count and byte limits fit.
Surviving payloads stay ordered by physical offset and are compacted leftwards
under the same atomic flag. Packed data is read with `memcpy`, without alignment
assumptions. Duplicate stores after competing misses merely refresh an existing
entry. Aging counters are reduced before overflow; ties may affect eviction
choice, never recognition correctness.

Readers copy under the flag. Recognition happens outside it, and a busy reader
or writer immediately falls back to the uncached path. There is no waiting,
shared heap ownership or reclamation protocol. Unsupported targets retain the
previous cache-disabled fallback.

## Native checks

Tests exercise entry-count and byte-capacity eviction separately, protect an
old entry through a recent hit, compare every retained boundary after compaction
to an uncached oracle, force a hash collision, check duplicate stores, and force
age overflow. Four concurrent document streams retain the independent oracle
checks. Existing oversized-entry, contention and allocation-failure checks pass.
The real-runtime interleaving checks also pass under AddressSanitizer and
UndefinedBehaviorSanitizer; the cache oracle passes those sanitizers and
ThreadSanitizer.

The regular suite passes: 275 corpus cases, 111 curated parity fixtures, 21
Node/query/editor/tooling checks, 14 original benchmark cases, 12 distinct editor
cases and the 80-case header matrix. The 348 representative cases and all
54,907 exhaustive cases have zero acceptance, structure or tokenization
disagreements. Coverage remains 103/103 alternatives and 68/68 token classes.
All 475 full baseline/candidate tree captures match through edits and undo,
including malformed recovery trees and independent fresh-parser comparisons.
Quint 0.33 `parse` and `typecheck` pass all 77 release examples (154 commands).
Packed Node/Bun consumers and generated-source checks pass.

Baseline native SHA-256:
`5ef96c55638c4c56aa560834d05bd56bd068e6d904833826ab3545e5b5cd0e46`.
Candidate native SHA-256:
`abcee449ed956b3893de9d5274bf223a333f397674d6a140f3556f6c1317aa89`.

## Paired ordinary measurements

After correctness jobs finished, five alternating baseline/candidate pairs per
document count ran in fresh Node v26.11.1 workers on Apple M5 Max, macOS arm64.
Each document has 512 plus its index definitions. All edit families and undo,
full-tree captures and deferred fresh validation remain enabled. Raw samples
and provenance are retained in `editor-measurements.json`.

| Documents | Edit p50, ms | Edit p95, ms | Worker peak RSS, KiB |
| --- | ---: | ---: | ---: |
| 1 | 2.27 → 2.22 | 12.78 → 13.25 | 100,368 → 100,032 |
| 2 | 12.43 → 2.23 | 13.79 → 13.48 | 104,896 → 104,224 |
| 4 | 12.21 → 2.21 | 13.53 → 12.78 | 142,832 → 140,592 |
| 10 | 12.61 → 2.27 | 14.62 → 13.38 | 176,400 → 184,832 |

Entries are medians of the five per-worker summaries, not a percentile of all
runs pooled together. Typical edits improve roughly 5.5-fold when files are
interleaved. The tail remains dominated by first-seen token-kind changes and
rejected variants. No cold-parse or universal tail-latency improvement is claimed.
Worker RSS includes validation/capture/GC behavior; the ten-file peak is higher
despite less recognition work. No general process-memory reduction or CI timing/
RSS threshold is claimed. Fixed native cache growth is reported separately above.

## Limits

The bound is a byte/entry budget, not a promise to retain every open document.
Large working sets, long documents and unseen token-kind edits can still miss.
Cold recognition, whole-file lexing/index rebuilding, contention fallback and
repeated-suffix error recovery remain separate costs. This does not introduce
incremental ATN evaluation or a WebAssembly cache speedup.
