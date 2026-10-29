# Boundary-position lookup performance

The baseline is `c593c92a1a5d3100b69652e86f4f26a7da52aee0`.
This tuning follows Recheck's performance workflow: freeze the baseline and
inputs, diagnose the work, change one mechanism, compare exact outputs, measure
ordinary builds separately from diagnostics, and check the remaining costs.

## Mechanism and contract

Previously every definition marker scanned the remaining source through EOF to
infer its byte offset. A 14 KB / 512-definition input made 3,073 lookups and
read 21,949,478 characters just for position lookup in a separate diagnostic C
build. This repeats work as the definition count grows.

The scanner now builds a byte suffix array once for each changed source. A
marker narrows the sorted suffixes using incoming characters until only one
position remains. It then finds the corresponding reference token with binary
search. It keeps the old zero-width marker end and documentation-comment prefix
handling. UTF-8 and embedded NUL remain distinct from EOF.

This lookup uses the current source, rather than guessing positions from scanner
call order. That matters when Tree-sitter backtracks, restores scanner state,
reuses a tree, or recovers an incomplete buffer. Document fingerprinting, scanner
serialization, reference recognition, boundary selection and public tree shapes
are unchanged. The whole-file initial lookahead still invalidates recognition
on every edit.

Building the index takes O(n log n) work, retains about 4 bytes per source byte,
and temporarily uses about 20 bytes per source byte. This does not guarantee
constant-time lookup: long identical suffix prefixes still require longer
lookahead. Whole-file recognition and its allocations remain further tuning
opportunities. There is no claim of fully incremental reference recognition.

## Regression and compatibility checks

`bun run test:scanner` compiles a standalone C contract check. It compares token
positions at every character boundary, exercises UTF-8, NUL, comments, empty and
incomplete documents, and changes documents within one scanner. The scaling
case checks a character-read budget, rather than a noisy elapsed-time threshold.
It failed before the change: 25,666,807 characters for 3,589 token-position
queries against a budget of 229,696. The candidate reads 42,322 characters.
The same test passes AddressSanitizer and UndefinedBehaviorSanitizer.

The ordinary test suite includes this check. Existing corpus trees and parity
expectations are not changed. The compatibility matrices and full upstream
structure checks are rerun against the pinned Quint 0.33.0 reference.

## Reproducing paired measurements

Before editing scanner code, build and copy the ordinary native binding to a
new temporary artifact directory. Keep baseline sources and the commit ID too:

```sh
make -C build BUILDTYPE=Release
mkdir -p /private/tmp/quint-perf-baseline
cp build/Release/tree_sitter_quint_binding.node /private/tmp/quint-perf-baseline/grammar.node
git rev-parse HEAD > /private/tmp/quint-perf-baseline/revision.txt
```

After the change, rebuild the candidate and run the paired benchmark:

```sh
make -C build BUILDTYPE=Release
bun run benchmark:parser \
  --baseline-binding /private/tmp/quint-perf-baseline/grammar.node \
  --examples /path/to/pinned/quint/examples \
  --output /private/tmp/quint-perf-measurements.json
```

Run benchmarks serially with other builds, tests and profiles finished. Five
fresh processes per binding/workload alternate order by pair. Ordinary release
bindings have no diagnostic instrumentation. Synthetic inputs vary definition
counts and repeated local bodies with Unicode comments; `--examples` adds the
three largest local release examples. A prefix-comment insertion, module rename
and incomplete final brace are each applied and reversed. Every incremental
result must match a fresh parse using the same binding. Both bindings must also
match each other's full tree capture, including named and anonymous nodes,
fields, error/missing flags, byte-equivalent binding indices, positions and child
counts. Captures run outside the timed sections.

The JSON retains every initial-parse and six-edit timing, peak process RSS,
input SHA-256, native-binding SHA-256, tree digest, runtime and host metadata.
Peak RSS includes startup and capture allocations; it is not scanner allocation
volume or an isolated parse-only memory measurement. There is no timing gate on
shared CI/development hosts. Repeat small or overlapping changes before making
a performance claim. Diagnostic build timings are never substituted for the
ordinary paired timings.

For additional exact comparisons, supply `--corpus DIR --rounds 1` and a fresh
output path. This checks every `.qnt` under the directory with the same six
forward/reverse edits, including rejected and incomplete source. Treat this as
compatibility evidence, not as the five-pair performance measurement.

Artifacts for this round are retained under
`/private/tmp/quint-perf-20261029`: baseline and candidate binaries/sources,
lookup-budget failure, diagnostic C sources, sanitizer executable, ordinary
measurements, compatibility captures and quality logs.

## Remaining cost after the change

A separate diagnostic C build of ICS20 attributed 25.107 CPU milliseconds to
reference recognition and 1.749 to suffix-index construction. The scanner made
259,713 allocation requests for a cumulative 39,432,804 bytes in that run.
These are instrumentation results from one input, not ordinary benchmark
latency, live memory, or process peak RSS. They point toward recognition and its
allocation pattern as the next experiment; they do not establish that a larger
cache or a different recognition algorithm would be safe or faster.

## Final ordinary measurements

Five alternating pairs per workload on Apple M5 Max, darwin/arm64, Node
26.11.1, ordinary release bindings, warm filesystem caches, shared host. These
are medians of five runs, not diagnostic-build timings:

| Input | Initial parse, ms | Six edits, ms | Process peak RSS, MiB |
| --- | ---: | ---: | ---: |
| definitions-32 | 2.59 → 2.00 | 13.42 → 10.14 | 59.3 → 56.5 |
| definitions-128 | 18.58 → 9.62 | 95.58 → 52.89 | 73.0 → 73.0 |
| definitions-512 | 190.76 → 52.85 | 961.44 → 273.95 | 136.9 → 137.3 |
| repeated-unicode-comments | 27.97 → 11.07 | 144.75 → 57.82 | 91.2 → 91.3 |
| cosmos/ics20/ics20.qnt | 100.09 → 22.12 | 519.22 → 118.26 | 134.2 → 134.4 |
| cosmos/ics23/ics23.qnt | 170.05 → 39.38 | 866.51 → 210.28 | 164.7 → 166.0 |
| cosmos/tendermint/Tendermint.qnt | 135.47 → 38.40 | 619.21 → 194.67 | 136.6 → 143.6 |

The three release examples reduce initial parse time by 72–78% and edit-sequence
time by 69–77%. Their initial-parse timing ranges do not overlap between versions.
Memory shows no consistent improvement: Tendermint's median RSS rises about 5%,
with overlapping observed ranges (baseline 135.3–148.7, candidate 139.6–147.3 MiB).
The retained index and native allocator behavior are part of the tradeoff. The
smallest synthetic input has overlapping initial timing ranges, so its median
change alone is not strong evidence for small-file latency.

`final-measurements.json` retains all 70 ordinary runs, their process CPU counters
(which include startup and tree capture), inputs and tree digests. Its baseline
binding SHA-256 is `881eb02ac5ea0adc4eefe2c1e832a002c08797015bde0efc1f728ece017c0f02`;
its candidate is `30443a7ecc0d5dc115b6b91f62fde960f10e9adf81b9be2a3e4efea76a18c31d`.
Strict separate comparisons cover 111 curated fixture files and all 77 release
examples, each with six edits and same-binding fresh-parse checks. All 54,907
permanent syntax/structure/tokenization cases, 273 corpus parses, 13 Node checks,
full upstream structure checks, package Node/Bun smoke tests, and standalone C
sanitizer checks pass. All 77 examples also pass the exact 0.33.0 compiler's
`parse` and `typecheck` commands (154 commands, zero failures).

The final allocation-failure guard was then covered by an additional initially
failing scanner test and a fresh full suite/package/paired-benchmark run; the
large differential matrices ran immediately before that defensive guard.
