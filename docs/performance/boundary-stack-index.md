# Boundary and persistent-stack indexes

Baseline: `60ba4ae`. Artifacts: `/private/tmp/quint-index-20261030`.
This follows the native profile in [memory-investigation.md](memory-investigation.md):
boundary matching and stack interning together consumed about 20% of CPU on
4,096 unique definitions. That diagnostic identified a target, not a predicted
end-to-end speedup.

## Change and failing test

The scanner previously searched every reference boundary for each begin/end
marker and scanned all previously interned stack records for each begin marker.
The root-level declaration-window check also searched every boundary.

A native work test recognizes 4,096 definitions, visits the real boundaries in
reverse order, and repeatedly re-enters previously visited parser branches.
Before changing those searches it recorded 805,371,904 comparison/probe steps,
failing a 3,145,728-step budget. It now records 1,675,146 steps. The hook counts
only search work and compiles to a no-op in production; this is not a timing
measurement or a claim that every parser workload improves by that ratio.

Reference boundaries are copied and sorted by start, kind and end, supporting
binary searches for both a start/kind prefix and an exact boundary. The original
reference traversal order is unchanged. Persistent stack records retain their
insertion order and serialized IDs; an open-addressed hash table maps
(parent ID, start, kind) to those records. The table grows at half occupancy.
Hash collisions compare complete keys. No existing-key lookup needs allocation.

Changing source clears the intern table and rebuilds the boundary index. Failed
allocations leave no published new stack ID and can be retried. The new sorted
copy costs `sizeof(QBoundary)` per reference boundary; the stack table costs
four bytes per slot and grows by powers of two. Both belong to the scanner and
are released at destruction. This adds storage; it does not promise lower RSS.

The grammar, generated parser, public node schema, reference recognizer and
16-byte serialized scanner format are unchanged. Whole-file recognition and
unrestricted malformed-input position lookup remain as before.

## Correctness

- 273 corpus tests and all 111 token/syntax/structure fixtures pass.
- All 16 Node/query/editor/tooling tests and 14 compiler-gated benchmark cases pass.
- Full before/after captures match on 273 corpus inputs, 111 fixtures and 77
  release examples. All 461 inputs also pass six edit/undo transitions and
  independent fresh-parser checks, preserving anonymous nodes, fields, ranges,
  child counts and error/missing flags.
- Both Quint 0.33 matrices pass: 8,259 boundary and 46,648 deep cases; zero
  acceptance, structure or tokenization disagreements. Deep structure checks
  compare 1,122,368 structures. Coverage remains 103/103 alternatives and 68/68
  emitted token classes.
- The pinned 0.33 upstream checkout passes structure comparison on 188 accepted
  files, 53,608 structures, with five rejected files skipped.
- The exact Quint 0.33 compiler passes `parse` and `typecheck` on all 77 release
  examples: 154 commands, zero failures.
- Native real-runtime cursor checks pass the 111 fixtures and repeated-text
  workloads. Boundary queries also agree with unordered reference searches;
  nested stack IDs survive re-entry, growth and source replacement.
- All 17 document/index allocation failure sites and 18 stack allocation sites
  pass retry checks. AddressSanitizer and UndefinedBehaviorSanitizer pass the
  index and position tests. Packed Node and Bun consumers pass.

## Paired measurements

Measurements use ordinary release bindings and the same schema-3 worker for
both versions: file input, event-loop turns between complete editor operations,
full tree capture and independent fresh parsing outside parse timers. Five
fresh alternating process pairs per input; shared Apple M5 Max host,
darwin/arm64, Node v26.11.1. RSS measures the entire validation worker, including
capture/collection effects described in [memory-investigation.md](memory-investigation.md).

The native baseline SHA-256 is
`0f5c60e1416252072d9cae76f83e6a29d85189143767ae66b4ddb727a492fcbe`;
the candidate is
`2955b77e9c319035fc9b9ec7edb80f27dd0bff0d847805ca5ecd72d910bf8e50`.

| Input | Initial parse, ms | Edit sequence, ms | Edits | Peak worker RSS, MiB |
| --- | ---: | ---: | ---: | ---: |
| definitions-512 | 16.25 → 16.17 | 142.23 → 139.03 | 10 | 104.38 → 104.38 |
| definitions-1024 | 37.01 → 34.39 | 343.69 → 319.66 | 10 | 166.91 → 169.03 |
| definitions-4096 | 220.90 → 173.81 | 2070.35 → 1622.48 | 10 | 354.50 → 355.38 |
| identical-definitions-256 | 6.69 → 6.41 | 53.37 → 52.12 | 10 | 76.67 → 76.67 |
| identical-definitions-1024 | 34.69 → 32.20 | 319.30 → 289.43 | 10 | 166.84 → 166.86 |
| incomplete-definitions-1024 | 29.53 → 28.91 | 208.12 → 207.56 | 8 | 161.59 → 161.95 |
| comment-65536 | 7.57 → 7.59 | 74.75 → 73.66 | 10 | 51.97 → 51.89 |
| comment-262144 | 29.96 → 29.81 | 297.53 → 296.75 | 10 | 64.73 → 64.55 |
| unterminated-comment-65536 | 8.03 → 7.98 | 46.53 → 46.47 | 6 | 51.42 → 51.44 |
| cosmos/ics20/ics20.qnt | 13.78 → 13.90 | 98.35 → 97.98 | 8 | 99.38 → 99.25 |
| cosmos/ics23/ics23.qnt | 19.01 → 18.88 | 172.51 → 170.77 | 10 | 110.62 → 110.58 |
| cosmos/tendermint/Tendermint.qnt | 14.35 → 14.42 | 124.84 → 124.31 | 10 | 102.64 → 102.45 |

The 4,096-definition medians improve about 21% initially and 22% over ten
edits. Timing ranges do not overlap for this workload. At 1,024 identical
definitions, medians improve about 7% initially and 9% over ten edits.
Smaller workloads and release examples show little change; the ics20 initial
median is slightly higher. No universal speedup or RSS reduction is claimed.
All 120 measurement workers pass full tree and fresh-parse checks. The complete
raw report is `measurements.json` in the artifact directory above.
