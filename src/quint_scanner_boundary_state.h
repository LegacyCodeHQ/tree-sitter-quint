#ifndef QUINT_SCANNER_BOUNDARY_STATE_H
#define QUINT_SCANNER_BOUNDARY_STATE_H
#include "quint_boundaries.h"

// Intern persistent stacks: scanner serialization stores a small stable ID,
// rather than imposing a nesting limit through Tree-sitter's 1024-byte buffer.
typedef struct { uint32_t parent, start; uint8_t kind; } QDefinitionStack;
typedef struct {
  QDocument document;
  char *source;
  uint32_t *suffixes;
  size_t length;
  uint64_t fingerprint;
  bool recognized;
  QDefinitionStack *stacks;
  size_t stack_count, stack_capacity;
  uint32_t stack;
} QScanner;

static size_t q_utf8(int32_t c, char bytes[4]) {
  if (c < 0x80) { bytes[0] = (char)c; return 1; }
  if (c < 0x800) { bytes[0] = (char)(0xc0 | (c >> 6)); bytes[1] = (char)(0x80 | (c & 0x3f)); return 2; }
  if (c < 0x10000) { bytes[0] = (char)(0xe0 | (c >> 12)); bytes[1] = (char)(0x80 | ((c >> 6) & 0x3f)); bytes[2] = (char)(0x80 | (c & 0x3f)); return 3; }
  bytes[0] = (char)(0xf0 | (c >> 18)); bytes[1] = (char)(0x80 | ((c >> 12) & 0x3f)); bytes[2] = (char)(0x80 | ((c >> 6) & 0x3f)); bytes[3] = (char)(0x80 | (c & 0x3f)); return 4;
}
// Prefix-doubling suffix sorting lets a zero-width boundary marker locate its
// source position after reading only a distinguishing prefix, instead of
// rescanning the entire remaining file for every definition.
static void q_suffix_sort(const uint32_t *input, uint32_t *output, size_t count,
                          const uint32_t *rank, size_t distance,
                          size_t max_rank, uint32_t *buckets) {
  memset(buckets, 0, (max_rank + 1) * sizeof(uint32_t));
  for (size_t i = 0; i < count; i++) {
    size_t at = (size_t)input[i] + distance;
    buckets[at < count ? rank[at] : 0]++;
  }
  uint32_t offset = 0;
  for (size_t i = 0; i <= max_rank; i++) {
    uint32_t width = buckets[i]; buckets[i] = offset; offset += width;
  }
  for (size_t i = 0; i < count; i++) {
    size_t at = (size_t)input[i] + distance;
    output[buckets[at < count ? rank[at] : 0]++] = input[i];
  }
}
static bool q_build_suffixes(QScanner *scanner) {
  size_t count = scanner->length + 1;
  if (count > UINT32_MAX || count > SIZE_MAX / sizeof(uint32_t)) return false;
  uint32_t *suffixes = malloc(count * sizeof(uint32_t));
  uint32_t *rank = malloc(count * sizeof(uint32_t));
  uint32_t *next_rank = malloc(count * sizeof(uint32_t));
  uint32_t *work = malloc(count * sizeof(uint32_t));
  size_t bucket_count = count > 257 ? count : 257;
  uint32_t *buckets = calloc(bucket_count, sizeof(uint32_t));
  if (!suffixes || !rank || !next_rank || !work || !buckets) {
    free(suffixes); free(rank); free(next_rank); free(work); free(buckets);
    return false;
  }
  for (size_t i = 0; i < count; i++) {
    suffixes[i] = (uint32_t)i;
    rank[i] = i < scanner->length ? (unsigned char)scanner->source[i] + 1u : 0;
  }
  size_t max_rank = 256;
  for (size_t distance = 1; distance < count; distance *= 2) {
    q_suffix_sort(suffixes, work, count, rank, distance, max_rank, buckets);
    q_suffix_sort(work, suffixes, count, rank, 0, max_rank, buckets);
    uint32_t classes = 0;
    next_rank[suffixes[0]] = 0;
    for (size_t i = 1; i < count; i++) {
      size_t a = suffixes[i - 1], b = suffixes[i];
      uint32_t ar = a + distance < count ? rank[a + distance] : 0;
      uint32_t br = b + distance < count ? rank[b + distance] : 0;
      if (rank[a] != rank[b] || ar != br) classes++;
      next_rank[b] = classes;
    }
    uint32_t *swap = rank; rank = next_rank; next_rank = swap;
    max_rank = classes;
    if ((size_t)classes + 1 == count) break;
  }
  free(rank); free(next_rank); free(work); free(buckets);
  free(scanner->suffixes); scanner->suffixes = suffixes;
  return true;
}
static int q_suffix_byte(const QScanner *scanner, size_t index, size_t consumed) {
  size_t at = (size_t)scanner->suffixes[index] + consumed;
  return at < scanner->length ? (unsigned char)scanner->source[at] : -1;
}
static uint32_t q_locate_source(QScanner *scanner, TSLexer *lexer) {
  if (lexer->eof(lexer)) return (uint32_t)scanner->length;
  size_t low = 0, high = scanner->length + 1, consumed = 0;
  while (low < high) {
    if (high - low == 1) return scanner->suffixes[low];
    char bytes[4];
    size_t width = lexer->eof(lexer) ? 1 : q_utf8(lexer->lookahead, bytes);
    for (size_t i = 0; i < width; i++) {
      int key = lexer->eof(lexer) ? -1 : (unsigned char)bytes[i];
      size_t left = low, right = high;
      while (left < right) {
        size_t mid = left + (right - left) / 2;
        if (q_suffix_byte(scanner, mid, consumed) < key) left = mid + 1;
        else right = mid;
      }
      low = left; right = high;
      while (left < right) {
        size_t mid = left + (right - left) / 2;
        if (q_suffix_byte(scanner, mid, consumed) <= key) left = mid + 1;
        else right = mid;
      }
      high = left; consumed++;
      if (low == high) return UINT32_MAX;
      if (high - low == 1) return scanner->suffixes[low];
    }
    if (lexer->eof(lexer)) return UINT32_MAX;
    lexer->advance(lexer, false);
  }
  return UINT32_MAX;
}

static bool q_scan_document(QScanner *scanner, TSLexer *lexer) {
  char *source = NULL;
  size_t length = 0, capacity = 0;
  uint64_t fingerprint = UINT64_C(14695981039346656037);
  // The zero-width initial token looks through EOF. An edit anywhere in the
  // file invalidates it; the fingerprint also prevents reuse of scanner states
  // from a different document. Boundary decisions therefore never use old text.
  lexer->mark_end(lexer);
  while (!lexer->eof(lexer)) {
    char bytes[4]; size_t width = q_utf8(lexer->lookahead, bytes);
    if (!q_grow((void **)&source, &capacity, length + width, 1)) { free(source); return false; }
    memcpy(source + length, bytes, width); length += width;
    for (size_t i = 0; i < width; i++) fingerprint = (fingerprint ^ (unsigned char)bytes[i]) * UINT64_C(1099511628211);
    lexer->advance(lexer, false);
  }
  if (scanner->length != length || scanner->fingerprint != fingerprint || (length && memcmp(scanner->source, source, length))) {
    free(scanner->source); scanner->source = source; scanner->length = length;
    scanner->fingerprint = fingerprint;
    scanner->recognized = q_parse_document(&scanner->document, source, length);
    scanner->stack_count = 0;
    free(scanner->suffixes); scanner->suffixes = NULL;
  } else free(source);
  // A failed allocation must be retried, never leave an index for old text.
  if (!scanner->suffixes && !q_build_suffixes(scanner)) return false;
  scanner->stack = 0;
  return true;
}
static uint32_t q_token_position(QScanner *scanner, TSLexer *lexer, unsigned prefix) {
  if (!prefix) lexer->mark_end(lexer);
  if (!scanner->suffixes) return UINT32_MAX;
  uint32_t at = q_locate_source(scanner, lexer);
  if (at == UINT32_MAX || at < prefix) return UINT32_MAX;
  size_t offset = at - prefix;
  QDocument *doc = &scanner->document;
  // Find the first token whose end follows this byte, including skipped text.
  size_t low = 0, high = doc->token_count;
  while (low < high) {
    size_t mid = low + (high - low) / 2;
    if (doc->tokens[mid].end <= offset && doc->tokens[mid].kind != -1) low = mid + 1;
    else high = mid;
  }
  return low < doc->token_count ? (uint32_t)low : UINT32_MAX;
}
static bool q_begin_definition(QScanner *scanner, uint32_t start, uint8_t kind) {
  if (scanner->recognized) {
    bool found = false;
    for (size_t i = 0; i < scanner->document.boundary_count; i++) {
      QBoundary b = scanner->document.boundaries[i];
      if (b.start == start && b.kind == kind) { found = true; break; }
    }
    if (!found) return false;
  }
  for (size_t i = 0; i < scanner->stack_count; i++) {
    QDefinitionStack s = scanner->stacks[i];
    if (s.parent == scanner->stack && s.start == start && s.kind == kind) { scanner->stack = (uint32_t)i + 1; return true; }
  }
  if (!q_grow((void **)&scanner->stacks, &scanner->stack_capacity, scanner->stack_count + 1, sizeof(QDefinitionStack))) return false;
  scanner->stacks[scanner->stack_count++] = (QDefinitionStack){scanner->stack, start, kind};
  scanner->stack = (uint32_t)scanner->stack_count;
  return true;
}
static bool q_end_definition(QScanner *scanner, uint32_t end, uint8_t kind) {
  if (!scanner->recognized) {
    while (scanner->stack && scanner->stack <= scanner->stack_count) {
      QDefinitionStack top = scanner->stacks[scanner->stack - 1];
      scanner->stack = top.parent;
      if (top.kind == kind) break;
    }
    return true;
  }
  if (!scanner->stack || scanner->stack > scanner->stack_count) return !scanner->recognized;
  QDefinitionStack top = scanner->stacks[scanner->stack - 1];
  if (top.kind != kind) return false;
  if (scanner->recognized) {
    bool found = false;
    for (size_t i = 0; i < scanner->document.boundary_count; i++) {
      QBoundary b = scanner->document.boundaries[i];
      if (b.start == top.start && b.end == end && b.kind == kind) { found = true; break; }
    }
    if (!found) return false;
  }
  scanner->stack = top.parent;
  return true;
}
#endif
