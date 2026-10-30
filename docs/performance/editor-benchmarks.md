# Interleaved editor benchmark

Artifacts: `/private/tmp/quint-multidoc-20261030`.

The preceding recognition-cache measurements kept one document active per
worker. A cache with one accepted and one rejected entry can lose those gains
when an editor alternates between files. This benchmark makes that behavior
visible without changing the parser.

```sh
bun run benchmark:editor --baseline-binding /path/to/baseline.node \
  --documents 1,2,4,10 --definitions 512 --rounds 5 \
  --output /private/tmp/quint-editor-results.json
```

Each worker owns a parser and current tree for every document. Declaration
counts differ, so the complete token-kind streams differ even though identifiers
and literal values do not influence recognition. The schedule parses all files,
then applies and undoes renames, literal changes, operator changes, semicolons,
and missing closing braces. Every phase visits the files in round-robin order.

All timed edits finish **before** independent fresh-parser validation begins.
A fresh validation parse between timed turns would populate the same native
cache and could conceal eviction. Full captures include anonymous nodes,
fields, ranges, missing/error flags and child counts. Each incremental capture
must match a separate fresh parser, and every output sequence must match the
frozen baseline. Capture work is outside timed regions; workers yield between
parses. No forced GC or instrumentation runs in the ordinary benchmark.

Reports preserve each source and binding hash, worker/case-generator hashes,
all turn timings and captures, per-worker p50/p95 edit latency using nearest
rank, CPU usage, and peak RSS. RSS includes validation and capture allocations;
it does not isolate native parser memory. Initial parses are excluded from edit
percentiles. Inputs are delivered through a file outside timed regions. A failed
comparison still writes the partial report, and existing reports are never
replaced.

The tooling test failed before the runner existed. It now checks 2, 4 and 10
interleaved documents, the edit/undo schedule, percentiles, full validation,
error flags and provenance. The small 12-source editor matrix is also checked
against the pinned Quint 0.33 lexer/parser in the regular suite. The ordinary
512-definition workloads have 60 distinct sources: Quint 0.33 `parse` and
`typecheck` validate 50 complete programs, and `parse` rejects all 10 missing-brace
variants, for 110 successful reference expectations. No elapsed-time or RSS
threshold is used in CI.

An initial one-pair same-binding control (`baseline-editor.json`) records a
2.24 ms p50 for one active document versus 12.56, 12.49 and 12.47 ms for 2, 4 and
10 interleaved documents. Both versions use the same native SHA-256
`5ef96c55638c4c56aa560834d05bd56bd068e6d904833826ab3545e5b5cd0e46`.
These exploratory samples identify an eviction workload; they are not a paired
optimization speedup claim. The full regular suite passes, including 21 Node/
query/editor/tooling checks. The production parser is unchanged in this commit.
