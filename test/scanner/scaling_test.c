// Deterministic allocation scaling, not an elapsed-time threshold.
#include <assert.h>
#include <stdio.h>
#include "allocations.h"
#include "../../src/quint_boundaries.h"
#undef malloc
#undef calloc
#undef realloc
#undef free

int main(void) {
  static char source[262144];
  const unsigned sizes[] = {1024, 4096};
  for (size_t test = 0; test < sizeof(sizes) / sizeof(sizes[0]); test++) {
    unsigned count = sizes[test];
    size_t length = (size_t)snprintf(source, sizeof(source), "module Scaling {\n");
    for (unsigned i = 0; i < count; i++) {
      int n = snprintf(source + length, sizeof(source) - length,
        "pure val value%u = %u + 1\n", i, i);
      assert(n > 0 && (size_t)n < sizeof(source) - length);
      length += (size_t)n;
    }
    length += (size_t)snprintf(source + length, sizeof(source) - length, "}\n");
    calls = requested = 0;
    QDocument doc = {0};
    assert(q_parse_document(&doc, source, length));
    q_document_destroy(&doc);
    assert(live == 0);
    fprintf(stderr, "%u definitions: %zu allocations, %zu requested bytes\n", count, calls, requested);
    assert(calls < count);
    assert(requested < (size_t)count * 40 * 1024);
  }
  puts("large-input recognition stays within its allocation-work budget");
}
