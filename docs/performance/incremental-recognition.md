# Incremental recognition investigation

Baseline: `2476429` (temporary allocation pooling).
Artifacts: `/private/tmp/quint-recognizer-perf-20261029/reuse*`.

## Experiment and observed result

The ATN observes token kinds, not identifier/literal text or byte offsets. A
prototype retokenized changed source and reused accepted boundary token indices
only when the entire complete token-kind sequence matched. It refreshed byte
offsets, source fingerprints, stack IDs and the position index, and always ran
recognition for changed kinds, incomplete lexing or a previous rejection.

Standalone scanner tests showed the intended reduction: a rename, integer
change, Unicode comment insertion or whitespace change needed 23 allocation
requests, versus about 250 for full recognition. Every token range and boundary
matched an independent fresh parse. Operators, semicolons, documentation
comments, missing braces, unfinished comments and nested initializer
continuations exercised invalidation. The prototype and tests are preserved in
the temporary artifacts, not shipped as an optimization.

Five ordinary alternating pairs per workload then showed **no consistent editor
latency improvement**. The three release examples' six-edit medians were
155.56 → 160.82, 111.84 → 112.12 and 99.82 → 100.69 ms. Initial timings were also
mixed. These measurements compare to the pooled-allocation baseline, not the
older source-position-index baseline. The passing standalone work counter was
not evidence that the cache survived a real editor parse.

## Runtime lifecycle that explains it

The installed Node binding uses Tree-sitter 0.25.1. In its vendored
`node_modules/tree-sitter/vendor/tree-sitter/lib/src/parser.c`:

- `ts_parser_parse` creates the external scanner when starting a parse.
- On completion it calls `ts_parser_reset`.
- `ts_parser_reset` calls `ts_parser__external_scanner_destroy` and clears the
  payload, including when a subsequent call will receive an edited old tree.

Old trees retain serialized external-token states, not the scanner payload.
Our initial zero-width guard looks through EOF and is invalidated by any source
edit. Scanning that invalidated guard begins with a new payload. Keeping token
kinds or memo records in that payload cannot preserve them between editor
parses. This also limits the lifetime of the existing source fingerprint and
interned stacks to the current scanner instance.

We removed the prototype rather than shipping extra code and token-buffer
allocations without an observed benefit. The editor regression test remains:
all 111 fixtures are taken through six content/recovery transitions, including
Unicode/NUL comments and module renames, and every complete node/field/range
capture must match a separate fresh parser. Existing focused local-boundary
edits remain in place too.

## What deeper reuse needs

A cache spanning parses needs an owner with a lifetime longer than the scanner,
or a different placement/meaning of the guard tokens so Tree-sitter can reuse
recognition state before an edit. The standard external-scanner ABI supplies
no stable host document identity or host-owned storage to `create`.

Changing guards requires explicit dependency tracking for greedy local bodies:
a failed alternative can inspect later input and affect an earlier boundary.
Accepted definition spans alone are insufficient invalidation ranges. The
whole-file choice between guarded recognition and recovery also affects how
unchanged earlier text is parsed when later text becomes incomplete.

That is an architectural follow-up, with its own tree-contract and concurrent
parser/lifetime checks. This round ships allocation reductions, retains
whole-file recognition, and adds large/adversarial workloads to measure where
the remaining work grows. It does not claim incremental reference recognition.
