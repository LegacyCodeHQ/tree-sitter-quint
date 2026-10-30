#ifndef QUINT_BOUNDARIES_H
#define QUINT_BOUNDARIES_H

// Recognition only: this interpreter does not construct a replacement syntax
// tree. It records declaration boundaries so Tree-sitter can select its own
// expression productions without a bounded GLR stack dropping the greedy path.
// All grammar states and token sets come from the pinned reference tables.

#include "quint_033_atn.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

typedef struct { uint32_t start, end; int16_t kind; } QToken;
typedef struct { uint32_t start, end; uint8_t kind; } QBoundary;
typedef struct {
  QToken *tokens;
  size_t token_count, token_capacity;
  QBoundary *boundaries;
  size_t boundary_count, boundary_capacity;
} QDocument;

static bool q_grow(void **data, size_t *capacity, size_t count, size_t width) {
  if (count <= *capacity) return true;
  size_t next = *capacity ? *capacity * 2 : 32;
  if (next < count) next = count;
  if (next > SIZE_MAX / width) return false;
  void *replacement = realloc(*data, next * width);
  if (!replacement) return false;
  *data = replacement;
  *capacity = next;
  return true;
}

static bool q_letter(unsigned char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
static bool q_digit(unsigned char c) { return c >= '0' && c <= '9'; }
static bool q_hex(unsigned char c) {
  return q_digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
static bool q_ident(unsigned char c) { return q_letter(c) || q_digit(c) || c == '_'; }

static bool q_tokenize(QDocument *doc, const char *source, size_t length) {
  size_t i = 0;
  while (i < length) {
    size_t start = i;
    unsigned char c = (unsigned char)source[i];
    int kind = 0;
    if (c == ' ' || c == '\t' || c == '\r' || c == '\n') { i++; continue; }
    if (c == '"') {
      for (i++; i < length && source[i] != '"'; i++) {}
      if (i == length) return false;
      i++; kind = 36;
    } else if ((c == '/' && i + 1 < length && source[i + 1] == '/') ||
               (c == '#' && i + 1 < length && source[i + 1] == '!')) {
      bool hashbang = c == '#';
      bool doccomment = !hashbang && i + 2 < length && source[i + 2] == '/';
      for (i += 2; i < length && source[i] != '\n'; i++) {}
      if (i == length) return false;
      i++;
      if (!hashbang && !doccomment) continue;
      kind = hashbang ? 67 : 68;
    } else if (c == '/' && i + 1 < length && source[i + 1] == '*') {
      for (i += 2; i + 1 < length && !(source[i] == '*' && source[i + 1] == '/'); i++) {}
      if (i + 1 >= length) return false;
      i += 2; continue;
    } else if (q_digit(c)) {
      kind = 38; i++;
      bool hex = c == '0' && i + 1 < length && source[i] == 'x' && q_hex((unsigned char)source[i + 1]);
      if (hex) i += 2;
      if (c != '0' || hex) {
        while (i < length) {
          bool digit = hex ? q_hex((unsigned char)source[i]) : q_digit((unsigned char)source[i]);
          if (digit) { i++; continue; }
          if (source[i] == '_' && i + 1 < length &&
              (hex ? q_hex((unsigned char)source[i + 1]) : q_digit((unsigned char)source[i + 1]))) {
            i += 2; continue;
          }
          break;
        }
      }
    } else if (q_letter(c) || (c == '_' && i + 1 < length && q_ident((unsigned char)source[i + 1]))) {
      for (i++; i < length && q_ident((unsigned char)source[i]); i++) {}
      kind = c >= 'A' && c <= 'Z' ? 66 : 65;
      for (size_t j = 0; j < sizeof(q_literals) / sizeof(q_literals[0]); j++) {
        if (strlen(q_literals[j].text) == i - start && !memcmp(source + start, q_literals[j].text, i - start)) {
          kind = q_literals[j].kind; break;
        }
      }
      if ((i - start == 4 && !memcmp(source + start, "true", 4)) ||
          (i - start == 5 && !memcmp(source + start, "false", 5))) kind = 37;
    } else {
      size_t longest = 0;
      for (size_t j = 0; j < sizeof(q_literals) / sizeof(q_literals[0]); j++) {
        size_t width = strlen(q_literals[j].text);
        if (width > longest && width <= length - i && !memcmp(source + i, q_literals[j].text, width)) {
          longest = width; kind = q_literals[j].kind;
        }
      }
      if (!kind) return false;
      i += longest;
    }
    if (!q_grow((void **)&doc->tokens, &doc->token_capacity, doc->token_count + 1, sizeof(QToken))) return false;
    doc->tokens[doc->token_count++] = (QToken){(uint32_t)start, (uint32_t)i, (int16_t)kind};
  }
  if (!q_grow((void **)&doc->tokens, &doc->token_capacity, doc->token_count + 1, sizeof(QToken))) return false;
  doc->tokens[doc->token_count++] = (QToken){(uint32_t)length, (uint32_t)length, -1};
  return true;
}

typedef struct QTrace {
  struct QTrace *left, *right;
  uint32_t start, end;
  uint8_t kind;
} QTrace;
typedef struct { uint32_t end; QTrace *trace; } QResult;
typedef struct QMemo {
  struct QMemo *hash_next, *allocated_next;
  QResult *results;
  size_t count, capacity;
  uint32_t position;
  uint16_t state;
  uint8_t precedence, status;
} QMemo;
typedef struct {
  QMemo *memo, *inner;
  size_t transition, inner_index;
} QFrame;
typedef struct QArena {
  struct QArena *next;
  size_t used, capacity;
  max_align_t data[];
} QArena;
typedef struct {
  QDocument *doc;
  QMemo **buckets, *allocated;
  QArena *arena;
  size_t bucket_count, memo_count;
  QFrame *frames;
  size_t depth, frame_capacity;
  bool failed;
} QRecognizer;

// Recognition owns all memo/trace/result lifetimes. Bump allocation keeps
// their addresses stable and releases them together after collecting boundaries.
static void *q_allocate(QRecognizer *r, size_t size) {
  size_t alignment = _Alignof(max_align_t);
  if (size > SIZE_MAX - (alignment - 1)) { r->failed = true; return NULL; }
  size = (size + alignment - 1) / alignment * alignment;
  QArena *arena = r->arena;
  if (!arena || size > arena->capacity - arena->used) {
    size_t capacity = size > 65536 ? size : 65536;
    if (capacity > SIZE_MAX - sizeof(QArena)) { r->failed = true; return NULL; }
    arena = malloc(sizeof(QArena) + capacity);
    if (!arena) { r->failed = true; return NULL; }
    arena->next = r->arena; arena->used = 0; arena->capacity = capacity;
    r->arena = arena;
  }
  void *result = (unsigned char *)arena->data + arena->used;
  arena->used += size;
  return result;
}

static size_t q_hash(uint16_t state, uint32_t pos, uint8_t precedence) {
  return ((size_t)pos * 2654435761u) ^ ((size_t)state * 40503u) ^ precedence;
}
static QMemo *q_memo(QRecognizer *r, uint16_t state, uint32_t pos, uint8_t precedence) {
  if (!r->bucket_count || r->memo_count >= r->bucket_count * 2) {
    size_t next = r->bucket_count ? r->bucket_count * 2 : 4096;
    QMemo **buckets = calloc(next, sizeof(QMemo *));
    if (!buckets) { r->failed = true; return NULL; }
    for (QMemo *m = r->allocated; m; m = m->allocated_next) {
      size_t hash = q_hash(m->state, m->position, m->precedence) & (next - 1);
      m->hash_next = buckets[hash]; buckets[hash] = m;
    }
    free(r->buckets); r->buckets = buckets; r->bucket_count = next;
  }
  size_t hash = q_hash(state, pos, precedence) & (r->bucket_count - 1);
  for (QMemo *m = r->buckets[hash]; m; m = m->hash_next)
    if (m->state == state && m->position == pos && m->precedence == precedence) return m;
  QMemo *m = q_allocate(r, sizeof(QMemo));
  if (!m) return NULL;
  *m = (QMemo){.state = state, .position = pos, .precedence = precedence};
  m->hash_next = r->buckets[hash]; r->buckets[hash] = m;
  m->allocated_next = r->allocated; r->allocated = m; r->memo_count++;
  return m;
}
static QTrace *q_trace(QRecognizer *r, QTrace *left, QTrace *right, uint8_t kind, uint32_t start, uint32_t end) {
  if (!kind) {
    if (!left) return right;
    if (!right) return left;
  }
  QTrace *trace = q_allocate(r, sizeof(QTrace));
  if (!trace) return NULL;
  *trace = (QTrace){left, right, start, end, kind};
  return trace;
}
static bool q_has_end(QMemo *m, uint32_t end) {
  for (size_t i = 0; i < m->count; i++) if (m->results[i].end == end) return true;
  return false;
}
static void q_result(QRecognizer *r, QMemo *m, uint32_t end, QTrace *trace) {
  if (m->count == m->capacity) {
    if (m->capacity > SIZE_MAX / 2 / sizeof(QResult)) { r->failed = true; return; }
    size_t capacity = m->capacity ? m->capacity * 2 : 1;
    QResult *results = q_allocate(r, capacity * sizeof(QResult));
    if (!results) return;
    if (m->count) memcpy(results, m->results, m->count * sizeof(QResult));
    m->results = results; m->capacity = capacity;
  }
  m->results[m->count++] = (QResult){end, trace};
}
static bool q_push(QRecognizer *r, QMemo *m) {
  if (!q_grow((void **)&r->frames, &r->frame_capacity, r->depth + 1, sizeof(QFrame))) {
    r->failed = true; return false;
  }
  m->status = 1;
  r->frames[r->depth++] = (QFrame){m, NULL, 0, 0};
  return true;
}
static bool q_matches(const QTransition *t, int token) {
  if (token < -1 || token > 71) return false;
  unsigned bit = (unsigned)(token + 1);
  return bit < 64 ? ((t->low >> bit) & 1) : ((t->high >> (bit - 64)) & 1);
}

// Evaluate the ordered ATN without recursion. Each state memo retains the first
// derivation for each possible end position. Caller continuations select the
// first complete derivation, preserving ANTLR's greedy alternative order.
static QMemo *q_recognize(QRecognizer *r) {
  QMemo *root = q_memo(r, q_rules[0], 0, 0);
  if (!root || !q_push(r, root)) return NULL;
  while (r->depth && !r->failed) {
    QFrame *frame = &r->frames[r->depth - 1];
    QMemo *m = frame->memo;
    const QState *s = &q_states[m->state];
    if (s->stop) {
      q_result(r, m, m->position, NULL);
      m->status = 2; r->depth--; continue;
    }
    if (frame->transition == s->count) { m->status = 2; r->depth--; continue; }
    const QTransition *t = &q_transitions[s->first + frame->transition];
    if (t->kind == 3) {
      QMemo *inner = frame->inner;
      if (!inner) {
        inner = q_memo(r, t->target, m->position, t->precedence);
        if (!inner) break;
        frame->inner = inner;
        if (!inner->status) { q_push(r, inner); continue; }
      }
      if (inner->status == 1 || frame->inner_index == inner->count) {
        frame->transition++; frame->inner = NULL; frame->inner_index = 0; continue;
      }
      QResult first = inner->results[frame->inner_index];
      QMemo *rest = q_memo(r, t->follow, first.end, m->precedence);
      if (!rest) break;
      if (!rest->status) { q_push(r, rest); continue; }
      if (rest->status == 2) {
        for (size_t i = 0; i < rest->count && !r->failed; i++) {
          QResult last = rest->results[i];
          if (q_has_end(m, last.end)) continue;
          QTrace *trace = first.trace;
          if (t->rule == 3 || t->rule == 4) trace = q_trace(r, trace, NULL, t->rule, m->position, first.end);
          q_result(r, m, last.end, q_trace(r, trace, last.trace, 0, 0, 0));
        }
      }
      frame->inner_index++; continue;
    }
    bool epsilon = t->kind == 1 || t->kind == 6 || t->kind == 10;
    if ((t->kind == 10 && t->precedence < m->precedence) || t->kind == 4 ||
        (!epsilon && (m->position >= r->doc->token_count || !q_matches(t, r->doc->tokens[m->position].kind)))) {
      frame->transition++; continue;
    }
    uint32_t next = m->position;
    if (!epsilon && r->doc->tokens[m->position].kind != -1) next++;
    QMemo *child = q_memo(r, t->target, next, m->precedence);
    if (!child) break;
    if (!child->status) { q_push(r, child); continue; }
    if (child->status == 2) {
      for (size_t i = 0; i < child->count && !r->failed; i++)
        if (!q_has_end(m, child->results[i].end)) q_result(r, m, child->results[i].end, child->results[i].trace);
    }
    frame->transition++;
  }
  return root;
}
static bool q_collect(QRecognizer *r, QTrace *root) {
  QTrace **stack = NULL;
  size_t count = 0, capacity = 0;
  if (root) {
    if (!q_grow((void **)&stack, &capacity, 1, sizeof(QTrace *))) return false;
    stack[count++] = root;
  }
  bool valid = true;
  while (count && valid) {
    QTrace *trace = stack[--count];
    if (trace->kind) {
      if (!q_grow((void **)&r->doc->boundaries, &r->doc->boundary_capacity, r->doc->boundary_count + 1, sizeof(QBoundary))) { valid = false; break; }
      r->doc->boundaries[r->doc->boundary_count++] = (QBoundary){trace->start, trace->end, trace->kind};
    }
    if (!q_grow((void **)&stack, &capacity, count + 2, sizeof(QTrace *))) { valid = false; break; }
    if (trace->right) stack[count++] = trace->right;
    if (trace->left) stack[count++] = trace->left;
  }
  free(stack);
  return valid;
}
static bool q_parse_tokens(QDocument *doc) {
  QRecognizer recognizer = {.doc = doc};
  QMemo *root = q_recognize(&recognizer);
  bool valid = false;
  if (root && !recognizer.failed) {
    for (size_t i = 0; i < root->count; i++) {
      if (root->results[i].end == doc->token_count - 1) {
        valid = q_collect(&recognizer, root->results[i].trace); break;
      }
    }
  }
  while (recognizer.arena) {
    QArena *next = recognizer.arena->next;
    free(recognizer.arena); recognizer.arena = next;
  }
  free(recognizer.buckets); free(recognizer.frames);
  return valid;
}
static inline bool q_parse_document(QDocument *doc, const char *source, size_t length) {
  doc->token_count = 0; doc->boundary_count = 0;
  return length <= UINT32_MAX && q_tokenize(doc, source, length) && q_parse_tokens(doc);
}

// A process-lifetime content cache survives scanner destruction without holding
// document pointers. Recognition depends only on the complete token-kind stream;
// boundaries contain token indices, never source byte offsets. Retokenize first
// and compare EVERY kind (including EOF), not just a fingerprint or prefix.
// Unsupported targets retain the uncached implementation.
#if !defined(Q_DISABLE_RECOGNITION_CACHE) && !defined(__STDC_NO_ATOMICS__) && \
    defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L && \
    !defined(_MSC_VER) && !defined(__EMSCRIPTEN__) && !defined(__wasm__)
#include <stdatomic.h>
#define Q_RECOGNITION_CACHE_ENABLED 1
enum { Q_CACHE_TOKENS = 65536, Q_CACHE_BOUNDARIES = 16384 };
static atomic_flag q_cache_lock = ATOMIC_FLAG_INIT;
static struct {
  int16_t kinds[Q_CACHE_TOKENS];
  QBoundary boundaries[Q_CACHE_BOUNDARIES];
  size_t token_count, boundary_count;
} q_recognition_cache;

// Return -1 on allocation failure, 0 on miss/busy, 1 on a complete copy. A busy
// reader or writer never waits: it performs ordinary recognition instead.
static int q_cached_boundaries(QDocument *doc) {
  if (doc->token_count > Q_CACHE_TOKENS ||
      atomic_flag_test_and_set_explicit(&q_cache_lock, memory_order_acquire)) return 0;
  int result = 0;
  if (doc->token_count == q_recognition_cache.token_count) {
    size_t i = 0;
    while (i < doc->token_count && doc->tokens[i].kind == q_recognition_cache.kinds[i]) i++;
    if (i == doc->token_count) {
      size_t count = q_recognition_cache.boundary_count;
      if (!q_grow((void **)&doc->boundaries, &doc->boundary_capacity, count, sizeof(QBoundary))) result = -1;
      else {
        if (count) memcpy(doc->boundaries, q_recognition_cache.boundaries, count * sizeof(QBoundary));
        doc->boundary_count = count; result = 1;
      }
    }
  }
  atomic_flag_clear_explicit(&q_cache_lock, memory_order_release);
  return result;
}
static void q_cache_boundaries(const QDocument *doc) {
  if (doc->token_count > Q_CACHE_TOKENS || doc->boundary_count > Q_CACHE_BOUNDARIES ||
      atomic_flag_test_and_set_explicit(&q_cache_lock, memory_order_acquire)) return;
  for (size_t i = 0; i < doc->token_count; i++) q_recognition_cache.kinds[i] = doc->tokens[i].kind;
  if (doc->boundary_count) memcpy(q_recognition_cache.boundaries, doc->boundaries,
    doc->boundary_count * sizeof(QBoundary));
  q_recognition_cache.token_count = doc->token_count;
  q_recognition_cache.boundary_count = doc->boundary_count;
  atomic_flag_clear_explicit(&q_cache_lock, memory_order_release);
}
static bool q_parse_document_cached(QDocument *doc, const char *source, size_t length) {
  doc->token_count = 0; doc->boundary_count = 0;
  if (length > UINT32_MAX || !q_tokenize(doc, source, length)) return false;
  int cached = q_cached_boundaries(doc);
  if (cached) return cached > 0;
  bool valid = q_parse_tokens(doc);
  if (valid) q_cache_boundaries(doc);
  return valid;
}
#else
#define q_parse_document_cached q_parse_document
#endif
static void q_document_destroy(QDocument *doc) {
  free(doc->tokens); free(doc->boundaries);
}
#endif
