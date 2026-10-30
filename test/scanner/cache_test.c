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

#ifdef Q_RECOGNITION_CACHE_ENABLED
static void clear_cache(void) {
  q_recognition_cache.count = q_recognition_cache.used = 0;
  q_recognition_cache.clock = 0;
}
static QDocument make_document(unsigned definitions) {
  size_t capacity = (size_t)definitions * 64 + 64;
  char *source = malloc(capacity); assert(source);
  size_t length = (size_t)snprintf(source, capacity, "module Capacity {\n");
  for (unsigned i = 0; i < definitions; i++) length += (size_t)snprintf(source + length,
    capacity - length, "pure val value%u = %u + 1\n", i, i);
  length += (size_t)snprintf(source + length, capacity - length, "}\n");
  assert(length < capacity);
  QDocument doc = {0}; assert(q_parse_document(&doc, source, length)); free(source);
  return doc;
}
static int checked_hit(const QDocument *oracle) {
  QDocument probe = {.tokens = oracle->tokens, .token_count = oracle->token_count};
  int hit = q_cached_boundaries(&probe);
  if (hit == 1) {
    assert(probe.boundary_count == oracle->boundary_count);
    for (size_t i = 0; i < probe.boundary_count; i++) {
      assert(probe.boundaries[i].start == oracle->boundaries[i].start);
      assert(probe.boundaries[i].end == oracle->boundaries[i].end);
      assert(probe.boundaries[i].kind == oracle->boundaries[i].kind);
    }
  }
  free(probe.boundaries);
  return hit;
}
static void capacity_checks(void) {
  clear_cache();
  QDocument small[Q_CACHE_ENTRIES + 1];
  for (size_t i = 0; i < Q_CACHE_ENTRIES; i++) {
    small[i] = make_document((unsigned)i + 1); q_cache_boundaries(&small[i]);
  }
  assert(q_recognition_cache.count == Q_CACHE_ENTRIES);
  assert(checked_hit(&small[0]) == 1); // Protect the oldest physical entry.
  small[Q_CACHE_ENTRIES] = make_document(Q_CACHE_ENTRIES + 1);
  q_cache_boundaries(&small[Q_CACHE_ENTRIES]);
  assert(checked_hit(&small[1]) == 0);
  assert(checked_hit(&small[0]) == 1);
  assert(checked_hit(&small[Q_CACHE_ENTRIES]) == 1);
  for (size_t i = 0; i <= Q_CACHE_ENTRIES; i++) q_document_destroy(&small[i]);

  clear_cache();
  QDocument large[20];
  for (size_t i = 0; i < 20; i++) {
    large[i] = make_document((unsigned)i + 1000); q_cache_boundaries(&large[i]);
    assert(q_recognition_cache.used <= Q_CACHE_BYTES);
    assert(q_recognition_cache.count <= Q_CACHE_ENTRIES);
  }
  assert(checked_hit(&large[0]) == 0);
  assert(checked_hit(&large[19]) == 1);
  // Every retained payload must still match the uncached oracle after moves.
  for (size_t entry = 0; entry < q_recognition_cache.count; entry++) {
    bool found = false;
    for (size_t i = 0; i < 20; i++) if (large[i].token_count == q_recognition_cache.entries[entry].token_count) {
      assert(checked_hit(&large[i]) == 1); found = true; break;
    }
    assert(found);
  }
  for (size_t i = 0; i < 20; i++) q_document_destroy(&large[i]);

  clear_cache();
  const char *plus = "module Hash { pure val value = 1 + 1 }";
  const char *minus = "module Hash { pure val value = 1 - 1 }";
  QDocument a = {0}, b = {0};
  assert(q_parse_document(&a, plus, strlen(plus)) && q_parse_document(&b, minus, strlen(minus)));
  assert(a.token_count == b.token_count);
  q_cache_boundaries(&a); q_cache_boundaries(&a);
  assert(q_recognition_cache.count == 1);
  q_recognition_cache.entries[0].hash = q_kind_hash(&b);
  assert(checked_hit(&b) == 0); // A forced hash collision cannot establish identity.
  q_recognition_cache.entries[0].hash = q_kind_hash(&a);
  q_recognition_cache.clock = UINT64_MAX;
  assert(checked_hit(&a) == 1 && q_recognition_cache.clock < UINT64_MAX);
  q_document_destroy(&a); q_document_destroy(&b);
  puts("cache entry/byte capacity, LRU, compaction, collisions and aging checks pass");
}
#endif
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
#ifdef Q_RECOGNITION_CACHE_ENABLED
  capacity_checks();
#endif
  pthread_t threads[4];
  for (size_t i = 0; i < 4; i++) assert(!pthread_create(&threads[i], NULL, exercise, (void *)i));
  for (size_t i = 0; i < 4; i++) assert(!pthread_join(threads[i], NULL));
  puts("cross-document recognition, invalidation, contention and concurrent oracle checks pass");
  return 0;
}
