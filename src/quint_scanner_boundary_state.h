#ifndef QUINT_SCANNER_BOUNDARY_STATE_H
#define QUINT_SCANNER_BOUNDARY_STATE_H
#include "quint_boundaries.h"

// Intern persistent stacks: scanner serialization stores a small stable ID,
// rather than imposing a nesting limit through Tree-sitter's 1024-byte buffer.
typedef struct { uint32_t parent, start; uint8_t kind; } QDefinitionStack;
typedef struct {
  QDocument document;
  char *source;
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
  } else free(source);
  scanner->stack = 0;
  return true;
}
static uint32_t q_token_position(QScanner *scanner, TSLexer *lexer, unsigned prefix) {
  if (!prefix) lexer->mark_end(lexer);
  size_t tail = 0;
  while (!lexer->eof(lexer)) {
    char bytes[4]; tail += q_utf8(lexer->lookahead, bytes);
    lexer->advance(lexer, false);
  }
  if (tail + prefix > scanner->length) return UINT32_MAX;
  size_t offset = scanner->length - tail - prefix;
  QDocument *doc = &scanner->document;
  for (size_t i = 0; i < doc->token_count; i++)
    if (doc->tokens[i].end > offset || doc->tokens[i].kind == -1) return (uint32_t)i;
  return UINT32_MAX;
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
