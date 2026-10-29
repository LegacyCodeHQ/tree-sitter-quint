#ifndef QUINT_TEST_ALLOCATIONS_H
#define QUINT_TEST_ALLOCATIONS_H
#include <stddef.h>
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
#endif
