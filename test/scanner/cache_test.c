#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include "../../src/quint_boundaries.h"

static const char *inputs[] = {
  "module One { pure val value = 1 pure def next = { val local = value local + 2 } }",
  "/* \xce\xbb new bytes */ module Longer { pure val renamed = 123456 pure def other = { val saved = renamed saved + 99 } }",
  "module One { pure val value = 1 pure def next = { val local = value\n-local\n} }",
  "module One { pure val value = 1 pure def next = { val local = value\n-local\nvalue\n} }",
  "module One { pure val value = 1 pure def next = { val local = value local + 2 }",
  "module One { pure val value = 1; pure def next = { val local = value local + 2 } }",
  "module One { /// documentation\n pure val value = 1 }",
  "module One { pure val match = 1 }", // Raw reference diagnostic path.
  "module One { pure val value = 1 } /* unfinished",
  "module One { pure val value = \"unfinished }",
  "module One { pure val value = Qualified::name }",
  "module One { pure val Value = true }",
  "module One {}\0trailing",
  "", "// unfinished", "#! directive\nmodule One {}",
};
static void compare(const char *source, size_t length) {
  QDocument cached = {0}, fresh = {0};
  bool valid = q_parse_document_cached(&cached, source, length);
  assert(valid == q_parse_document(&fresh, source, length));
  assert(cached.token_count == fresh.token_count);
  for (size_t i = 0; i < fresh.token_count; i++) {
    assert(cached.tokens[i].kind == fresh.tokens[i].kind);
    assert(cached.tokens[i].start == fresh.tokens[i].start);
    assert(cached.tokens[i].end == fresh.tokens[i].end);
  }
  assert(cached.boundary_count == fresh.boundary_count);
  for (size_t i = 0; i < fresh.boundary_count; i++) {
    assert(cached.boundaries[i].start == fresh.boundaries[i].start);
    assert(cached.boundaries[i].end == fresh.boundaries[i].end);
    assert(cached.boundaries[i].kind == fresh.boundaries[i].kind);
  }
  q_document_destroy(&cached); q_document_destroy(&fresh);
}
static void *exercise(void *argument) {
  size_t offset = (size_t)argument;
  for (size_t round = 0; round < 16; round++) {
    for (size_t i = 0; i < sizeof(inputs) / sizeof(inputs[0]); i++) {
      const char *source = inputs[(i + offset) % (sizeof(inputs) / sizeof(inputs[0]))];
      compare(source, strlen(source));
    }
  }
  return NULL;
}
int main(void) {
  // Adjacent equal-kind documents must hit while preserving their own offsets.
  compare(inputs[0], strlen(inputs[0]));
  compare(inputs[1], strlen(inputs[1]));
  compare(inputs[12], sizeof("module One {}\0trailing") - 1);
#ifdef Q_RECOGNITION_CACHE_ENABLED
  QDocument doc = {0};
  assert(q_parse_document_cached(&doc, inputs[0], strlen(inputs[0])));
  QDocument rejected = {0};
  assert(!q_parse_document_cached(&rejected, inputs[4], strlen(inputs[4])));
  assert(q_cached_boundaries(&rejected) == 2);
  // Keeping the rejection must not evict the accepted tree needed after undo.
  assert(q_cached_boundaries(&doc) == 1);
  assert(!atomic_flag_test_and_set_explicit(&q_cache_lock, memory_order_acquire));
  // Contention is a miss, never a wait, even when this thread owns the lock.
  assert(q_cached_boundaries(&doc) == 0);
  q_cache_boundaries(&doc);
  assert(q_cached_boundaries(&rejected) == 0);
  q_cache_rejection(&rejected);
  QDocument busy = {0};
  assert(q_parse_document_cached(&busy, inputs[0], strlen(inputs[0])));
  q_document_destroy(&busy);
  atomic_flag_clear_explicit(&q_cache_lock, memory_order_release);
  // Oversized entries cannot read beyond or replace the bounded arrays.
  size_t saved = doc.token_count;
  doc.token_count = Q_CACHE_TOKENS + 1;
  assert(q_cached_boundaries(&doc) == 0);
  q_cache_boundaries(&doc);
  q_cache_rejection(&doc);
  doc.token_count = saved;
  saved = doc.boundary_count; doc.boundary_count = Q_CACHE_BOUNDARIES + 1;
  q_cache_boundaries(&doc);
  doc.boundary_count = saved;
  assert(q_cached_boundaries(&doc) == 1);
  assert(q_cached_boundaries(&rejected) == 2);
  q_document_destroy(&doc);
  q_document_destroy(&rejected);
#endif
  pthread_t threads[4];
  for (size_t i = 0; i < 4; i++) assert(!pthread_create(&threads[i], NULL, exercise, (void *)i));
  for (size_t i = 0; i < 4; i++) assert(!pthread_join(threads[i], NULL));
  puts("cross-document recognition, invalidation, contention and concurrent oracle checks pass");
  return 0;
}
