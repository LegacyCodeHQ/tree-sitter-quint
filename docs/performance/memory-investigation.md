# Validation-worker RSS investigation

Baseline parser: `146b113`. Artifacts: `/private/tmp/quint-memory-20261029`.
This follows [repeated-position.md](repeated-position.md), which reported a
217 → 255 MiB stress-worker RSS increase despite similar single-parse peaks.
Repeated names are intentional syntax/editor stress input, not a claim of
name-resolution or typechecking validity.

No grammar, generated parser, scanner, public tree, or recovery change ships
in this investigation. The native binding remains byte-identical, SHA-256
`0f5c60e1416252072d9cae76f83e6a29d85189143767ae66b4ddb727a492fcbe`.

## Native allocation accounting

A separate diagnostic build intercepts allocations in the scanner and its
recognizer, counts requested live/peak bytes, and verifies zero live blocks
after the real Tree-sitter parser finishes. It excludes Tree-sitter runtime,
Node, JavaScript, allocator bookkeeping and process RSS. Tracked realloc uses
allocate-copy-free, so peaks reflect this diagnostic allocator rather than
production in-place realloc behavior. The 1,024-identical-
definition input compares the pre-position-window scanner (`8b3b503`) to the
current scanner:

| Requested scanner storage | Before position windows | After position windows |
| --- | ---: | ---: |
| Peak live bytes | 30,193,928 | 30,193,960 |
| Live after the initial guard | 245,968 | 352,584 |
| Live after parsing/destruction | 0 | 0 |

The additional retained 106,616 bytes are the inverse suffix ranks, sorted
marker positions and scanner fields. Recognition's temporary storage dominates
the peak, which differs by only 32 bytes. These figures do not explain a roughly
38 MiB process increase. They provide no evidence of a scanner leak on this
workload, rather than a universal leak-freedom claim.

## Capture and collection interventions

`scripts/profile-parser-memory.mjs` runs fresh diagnostic workers against one
frozen source and binding. Its four modes perform the same parse/edit/fresh-
parse sequence, with explicit differences:

- `full` reproduces the old uninterrupted synchronous worker and full captures.
- `no-capture` omits captures and tree equivalence checks. Reports clearly label
  validation as omitted; syntax flags are still compared. This is never a
  normal benchmark mode.
- `yield` retains complete captures and comparisons, allowing one event-loop
  turn between operations. It does not force collection or introduce a timer.
- `gc` additionally requests collection, with Node's `--expose-gc`. It is a
  diagnostic intervention, never an ordinary latency measurement.

The modes with captures must agree on every output digest, including nodes,
fields, ranges and error/missing flags, and each incremental tree must match
fresh parsing. The report records phase samples of RSS, JavaScript heap,
external memory and array buffers, plus the process high-water RSS. Heap peaks
are sampled phase maxima, not continuous allocation peaks.

Three rounds on Apple M5 Max / darwin arm64 / Node v26.11.1, using 1,024 repeated
definitions (`current-diagnostic.json`), give these medians:

| Mode | Process peak RSS, MiB | Sampled heap peak, MiB | Full tree validation |
| --- | ---: | ---: | --- |
| uninterrupted captures | 270.80 | 61.09 | yes |
| capture-free diagnostic | 120.08 | 6.38 | omitted |
| captures with event-loop turns | 168.38 | 30.38 | yes |
| captures with explicit GC | 120.23 | 13.56 | yes |

An initial single-worker intervention batch independently showed the same
ordering (251, 113, 171 and 121 MiB respectively). These are diagnostics, not
parser speedup results. Removing validation allocations or giving collection/
finalization opportunities changes peaks substantially without changing the
native parser. The installed Node binding caches per-node native entries using
weak references and finalizers (`node_modules/tree-sitter/src/tree.cc`), so
capture-created nodes also have collection-dependent native overhead.

Together the interventions and native accounting identify capture allocations
and GC/finalization cadence as the main explanation for the worker difference.
They do not assign every resident byte to a particular V8 or native allocator.

## Measurement change

Ordinary parser benchmarks now allow an event-loop turn after the initial
capture and after each complete edit/fresh-validation pair. This models separate
editor operations and lets pending finalization run. There is no forced GC.
Parse timers, captures, fresh-parser assertions and input hashes retain their
meaning; the yield occurs outside all parse timing regions.

Reports use schema 3 and record `scheduling: "yield-between-parses"` and
`peakRssScope: "full-validation-worker"`. Do not compare new RSS or latency
figures directly with earlier synchronous-worker reports as if only the parser
changed. RSS still includes validation and is not isolated parser memory.
Normal benchmark workers assert full validation and reject diagnostic results.

A three-round diagnostic with the old scanner and the same yielding worker
records 133.34 MiB peak RSS, versus 168.38 MiB for the current scanner. Thus
yielding reduces absolute validation peaks but does **not** remove the
between-binding RSS difference. The difference remains sensitive to
collection/allocator behavior and does not establish an increase in live scanner storage;
the investigation does not assign every byte or claim a parser memory fix.
A separate single-worker forced-GC pilot with the old scanner records 127.56
MiB, compared with the current scanner's three-round median of 120.23 MiB.
This controlled intervention further weakens a live-scanner-regression
interpretation, but its single old-worker sample is not a memory speedup claim.

Reproduce the diagnostic separately from ordinary timing runs:

```sh
node scripts/profile-parser-memory.mjs \
  --binding /path/to/frozen/grammar.node \
  --source /path/to/input.qnt --rounds 3 \
  --output /private/tmp/quint-memory-profile.json
```

Use `--modes yield` or `--modes full,gc` for a focused experiment. Keep the input
and binding immutable throughout a run; their hashes are recorded and checked.
The worker source hash is also retained and checked. No wall-time or RSS
threshold is used as a CI correctness test.

## Remaining editor costs and rejected recovery pilot

A native CPU diagnostic attributes the following costs on representative
inputs. Counters and allocation interception perturb timing, so these numbers
rank mechanisms; they are not ordinary release timings or new speedup claims.

| Input | Total CPU, ms | Recognition | Position lookup | Begin/end searches |
| --- | ---: | ---: | ---: | ---: |
| 1,024 identical syntactic definitions | 44.01 | 25.61 | 3.78 | 5.20 |
| 512 valid definitions after a malformed name | 809.51 | 10.84 | 783.99 | 1.69 |
| 1,024 definitions without a closing brace | 29.15 | 24.90 | 0 | 0 |
| 4,096 unique valid definitions | 261.81 | 159.91 | 20.25 | 51.58 |

A name such as `match` triggers the reference diagnostic path and Tree-sitter
error recovery. Its 2,562 unrestricted lookups repeatedly inspect identical
suffixes. A failed pilot reset conservative lookup after a matched declaration
end. The existing recovery tree repeatedly restores the failed declaration's
scanner state, so this did not remove the cliff: the 128-definition work-budget
case still made 889,545 reads against a budget of 181,568. The pilot and its
failing diagnostic are retained in the artifacts; neither ships. Improving the
visible recovery tree would violate the requested existing-tree contract.

Valid edits and a missing brace are dominated by whole-file recognition. The
[lifecycle investigation](incremental-recognition.md) still applies: Tree-sitter
0.25.1 destroys the scanner payload after each parse, so a payload-local cache
cannot help subsequent editor parses. Reuse needs a longer-lived owner and
sound invalidation for lookahead dependencies, or a guard redesign with exact
recovery-tree checks. That architectural work remains open.

Boundary and stack indexing is the next smaller native optimization supported
by this profile: begin/end scans alone account for about 20% of the 4,096-
definition diagnostic. It can be pursued separately without claiming that it
solves recovery identity or incremental recognition.

The [boundary/stack indexing follow-up](boundary-stack-index.md) implements that
optimization and records its compatibility checks and paired measurements.

## Validation

The memory tests first failed because the worker supplied no validation or
scheduling metadata and the profiler did not exist. Both tests now pass. They
check full digest equivalence across modes on a Unicode/NUL fixture, explicit
capture omission, GC opt-in, ordinary scheduling, and report provenance.

The complete suite passes: 273 corpus inputs, 111 reference fixtures, 16 Node/
query/editor/tooling checks, and 14 reference-gated benchmark workloads. A
separate comparison of archived synchronous and new yielding workers matches
all 111 fixture output sequences, including six edits and independent fresh
parses. Full stress-profile outputs also match across the old and current
bindings. A schema-3 ordinary smoke run checks five complete/malformed/nested
workloads; its one-pair timings are not used for a performance claim.

The parser source and native binding are unchanged, so the previous commit's
54,907-case matrices and compiler-example evidence still describe this parser;
those large checks were not rerun to evaluate a scheduling-only tooling change.
Generated-source freshness and whitespace checks pass.
