// Count native allocation work and inject failures without shipping hooks.
#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "allocations.h"
#include "../../src/quint_boundaries.h"
#undef malloc
#undef calloc
#undef realloc
#undef free

int main(void) {
  char source[32768];
  size_t length = (size_t)snprintf(source, sizeof(source), "module Allocations {\n");
  for (unsigned i = 0; i < 512; i++) length += (size_t)snprintf(source + length,
    sizeof(source) - length, "pure val value%u = %u + 1\n", i, i);
  length += (size_t)snprintf(source + length, sizeof(source) - length, "}\n");
  QDocument doc = {0};
  assert(q_parse_document(&doc, source, length));
  assert(doc.boundary_count > 0);
  q_document_destroy(&doc);
  assert(live == 0);
  fprintf(stderr, "recognizer: %zu allocations, %zu requested bytes\n", calls, requested);
  assert(calls < 5000);
  assert(requested < 20 * 1024 * 1024);

  // Every allocation site on a smaller complete recognition must fail cleanly.
  const char small[] = "module Failure { pure def result = { val x = 1; x + 2 } }";
  const char *inputs[] = {small, source};
  size_t lengths[] = {sizeof(small) - 1, length};
  for (size_t input = 0; input < 2; input++) {
    calls = requested = 0;
    doc = (QDocument){0};
    assert(q_parse_document(&doc, inputs[input], lengths[input]));
    size_t sites = calls;
    q_document_destroy(&doc);
    assert(live == 0);
    for (size_t site = 1; site <= sites; site++) {
      calls = requested = 0; fail_at = site;
      doc = (QDocument){0};
      assert(!q_parse_document(&doc, inputs[input], lengths[input]));
      q_document_destroy(&doc);
      assert(live == 0);
    }
    fail_at = 0;
    printf("recognizer allocation budget and %zu failure sites pass\n", sites);
  }
}
