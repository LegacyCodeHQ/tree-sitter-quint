# Recognizer allocation experiment

Baseline: `69a15c97af80b816e81a42a3db25dd78bab5068c`.
Artifacts: `/private/tmp/quint-recognizer-perf-20261029`.

First, a separate small-result-vector experiment replaced the initial 32-result
allocation with one result and doubling growth. Five alternating ordinary pairs
per workload (`small-results.json`) preserved exact trees and reduced process
RSS on larger inputs. Latency changes varied, so allocation calls remained the
next target.

The shipped change keeps one-result growth and allocates memo records, traces
and result arrays in an aligned 64 KiB block arena. Every object has the same
recognition lifetime; public boundaries are copied before the arena is released.
No arena or memo graph is retained between edits. Hash table and explicit-frame
growth, first-derivation ordering, tokenization, recovery and scanner state are
unchanged. Old result-array storage remains in the arena until recognition ends;
the final matrix includes a complex ICS23 example to measure this cost.

## Deterministic work and failure checks

The 512-definition allocation-budget test fails on the baseline at 303,267
native allocation requests / 40,271,144 requested bytes. The candidate makes
241 requests / 16,346,592 bytes: 99.92% fewer calls and 59.4% fewer cumulative
requested bytes. These counters cover recognition and its document vectors,
not Tree-sitter or Node startup; requested bytes are not peak/live memory.

`test/scanner/recognizer_test.c` wraps allocation only inside the test executable.
It checks the budget, then fails every allocation in turn for both a small
nested-local program (8 allocation sites) and the 512-definition input (241
sites). Each attempt must reject cleanly and release every allocation. Both
normal and ASan/UBSan runs pass. No instrumentation ships in the scanner.

## Ordinary paired measurements

Same method as [source-position tuning](boundary-position.md): fresh processes,
five alternating pairs, release bindings, exact captures of initial/incremental
and fresh trees, capture outside parse timing, no concurrent tests/profiles.
Apple M5 Max, darwin/arm64, Node 26.11.1, shared host, warm filesystem caches.
Numbers are medians; process peak RSS includes startup and capture.

| Input | Initial parse, ms | Six edits, ms | Process peak RSS, MiB |
| --- | ---: | ---: | ---: |
| definitions-32 | 2.12 → 1.56 | 10.58 → 6.51 | 58.9 → 58.6 |
| definitions-128 | 7.16 → 5.71 | 39.44 → 20.95 | 72.8 → 70.5 |
| definitions-512 | 25.41 → 16.75 | 140.39 → 87.36 | 135.2 → 115.0 |
| repeated-unicode-comments | 11.28 → 7.73 | 58.68 → 40.03 | 91.5 → 81.8 |
| cosmos/ics20/ics20.qnt | 22.78 → 14.42 | 119.92 → 80.60 | 135.0 → 113.2 |
| cosmos/ics23/ics23.qnt | 42.70 → 28.18 | 224.48 → 157.90 | 166.1 → 159.8 |
| cosmos/tendermint/Tendermint.qnt | 27.00 → 16.18 | 131.76 → 82.70 | 141.4 → 113.6 |

The three release examples show 34–40% lower initial parse time and 30–37%
lower edit-sequence time than the source-position-index baseline. Peak RSS falls
by about 4–20% on those examples. This is one measured batch on a shared host,
not a promise of the same improvement for arbitrary inputs. The small-result
and arena batches were run at different times; compare each to its own paired
baseline rather than treating those batches as head-to-head timings.

`arena.json` preserves all 70 raw measurements, input/binding fingerprints and
490 tree captures. The complete 273-case corpus, 111 reference fixtures, 13 Node
checks, and 8,259-case base syntax/structure/tokenization matrix pass unchanged.
The larger deep matrix and final restored-source validation are recorded in
[the scaling report](scaling.md). Whole-file recognition still runs after edits;
the incremental investigation explains why the payload-only reuse prototype was
not shipped.
