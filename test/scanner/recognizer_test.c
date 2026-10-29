// Count native allocation work and inject failures without shipping hooks.
#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { size_t bytes; max_align_t alignment; } Allocation;
static size_t calls, requested, live, fail_at;
static void *allocate(size_t bytes) {
  calls++; requested += bytes;
  if (fail_at && calls == fail_at) return NULL;
  Allocation *a = malloc(sizeof(Allocation) + bytes);
  if (!a) return NULL;
  a->bytes = bytes; live++;
  return a + 1;
}
static void release(void *pointer) {
  if (pointer) { live--; free((Allocation *)pointer - 1); }
}
static void *zeroed(size_t count, size_t width) {
  void *p = allocate(count * width);
  if (p) memset(p, 0, count * width);
  return p;
}
static void *resize(void *pointer, size_t bytes) {
  void *next = allocate(bytes);
  if (next && pointer) {
    Allocation *old = (Allocation *)pointer - 1;
    memcpy(next, pointer, old->bytes < bytes ? old->bytes : bytes);
    release(pointer);
  }
  return next;
}
#define malloc allocate
#define calloc zeroed
#define realloc resize
#define free release
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
