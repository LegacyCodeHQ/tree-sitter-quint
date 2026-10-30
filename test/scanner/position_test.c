// Standalone contract check: cc -std=c11 -O2 -I src test/scanner/position_test.c -o /tmp/quint-position-test
#include <assert.h>
#include <stdio.h>
#include "allocations.h"
#include "../../src/scanner.c"

typedef struct {
  TSLexer lexer;
  const char *source;
  size_t length, offset, marked, advances;
} Input;
static void look(Input *input) {
  const unsigned char *s = (const unsigned char *)input->source;
  size_t i = input->offset;
  int32_t c = i < input->length ? s[i] : 0;
  if (c >= 0xc0) {
    unsigned width = c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4;
    c &= (1 << (7 - width)) - 1;
    for (unsigned j = 1; j < width; j++) c = (c << 6) | (s[i + j] & 0x3f);
  }
  input->lexer.lookahead = c;
}
static void advance(TSLexer *lexer, bool skip) {
  (void)skip;
  Input *input = (Input *)lexer;
  char bytes[4];
  if (input->offset < input->length) input->offset += q_utf8(lexer->lookahead, bytes);
  input->advances++;
  look(input);
}
static void mark(TSLexer *lexer) { Input *input = (Input *)lexer; input->marked = input->offset; }
static bool eof(const TSLexer *lexer) {
  const Input *input = (const Input *)lexer;
  return input->offset == input->length;
}
static Input at(const char *source, size_t length, size_t offset) {
  Input input = {.lexer = {.advance = advance, .mark_end = mark, .eof = eof},
    .source = source, .length = length, .offset = offset, .marked = offset};
  look(&input);
  return input;
}
static void check(QScanner *scanner, const char *source, size_t length) {
  Input input = at(source, length, 0);
  assert(q_scan_document(scanner, &input.lexer));
  assert(input.marked == 0);
  // Error recovery permits arbitrary jumps and keeps the unrestricted lookup.
  scanner->recovering = true;
  for (size_t offset = 0; offset <= length; offset++) {
    if (offset < length && ((unsigned char)source[offset] & 0xc0) == 0x80) continue;
    input = at(source, length, offset);
    uint32_t token = q_token_position(scanner, &input.lexer, 0);
    uint32_t expected = UINT32_MAX;
    for (size_t i = 0; i < scanner->document.token_count; i++) {
      if (scanner->document.tokens[i].end > offset || scanner->document.tokens[i].kind == -1) {
        expected = (uint32_t)i; break;
      }
    }
    assert(token == expected);
    assert(input.marked == offset);
    // The recovery filter must never reject an end that the original position
    // lookup could accept, including interior token bytes and leading trivia.
    if (scanner->recognized) {
      for (size_t i = 0; i < scanner->document.boundary_count; i++) {
        QBoundary boundary = scanner->document.boundaries[i];
        if (boundary.start == expected) {
          input = at(source, length, offset);
          assert(q_begin_may_match(scanner, &input.lexer, boundary.kind == 4, boundary.kind == 3));
          assert(!q_begin_may_match(scanner, &input.lexer, false, false));
        }
        if (boundary.end != expected) continue;
        scanner->stack = 0;
        assert(q_begin_definition(scanner, boundary.start, boundary.kind));
        input = at(source, length, offset);
        assert(q_end_may_match(scanner, &input.lexer, 0, boundary.kind == 4, boundary.kind == 3));
        assert(!q_end_may_match(scanner, &input.lexer, 0, false, false));
        if (offset + 3 <= length && !memcmp(source + offset, "///", 3)) {
          input = at(source, length, offset + 2);
          assert(q_end_may_match(scanner, &input.lexer, 2, boundary.kind == 4, boundary.kind == 3));
        }
      }
    }
    if (offset + 3 <= length && !memcmp(source + offset, "///", 3)) {
      input = at(source, length, offset + 2);
      input.marked = offset;
      assert(q_token_position(scanner, &input.lexer, 2) == expected);
      assert(input.marked == offset);
    }
  }
}
static void suffix_windows(QScanner *scanner, const char *source, size_t length) {
  Input input = at(source, length, 0);
  assert(q_scan_document(scanner, &input.lexer));
  for (size_t offset = 0; offset <= length;) {
    for (size_t start = 0; start <= offset; start++) for (size_t end = offset; end <= length; end++) {
      input = at(source, length, offset);
      assert(q_locate_source(scanner, &input.lexer, start, end) == offset);
    }
    if (offset == length) break;
    input = at(source, length, offset);
    char bytes[4]; offset += q_utf8(input.lexer.lookahead, bytes);
  }
}
int main(void) {
  QScanner *scanner = tree_sitter_quint_external_scanner_create();
  Input uninitialized = at("module", 6, 0);
  assert(q_token_position(scanner, &uninitialized.lexer, 0) == UINT32_MAX);
  const char prefixes[] = "ababa\0ababxaba";
  const char unicode_prefixes[] = "\xce\xbb" "a" "\xce\xbb" "b" "\xce\xbb" "a";
  suffix_windows(scanner, prefixes, sizeof(prefixes) - 1);
  suffix_windows(scanner, unicode_prefixes, sizeof(unicode_prefixes) - 1);
  const char source[] = "module Position {\n/// repeated \xce\xbb \xf0\x9f\x8c\xb3\n"
    "pure val first = \"same\"\n/* same\0same */\npure val second = \"same\"\n}\n";
  check(scanner, source, sizeof(source) - 1);
  // Rebuild after different documents, including empty and invalid editor text.
  check(scanner, "", 0);
  check(scanner, "module Incomplete {", 19);
  check(scanner, source, sizeof(source) - 1);
  const char repeated[] = "module Repeated {\npure val same = 1\npure val same = 1\n}\n";
  check(scanner, repeated, sizeof(repeated) - 1);
  const char zeros[] = {0, 0, 0, 0};
  check(scanner, zeros, sizeof(zeros));
  char identical[256];
  memset(identical, 'a', sizeof(identical));
  check(scanner, identical, sizeof(identical));
  char many[32768];
  size_t length = (size_t)snprintf(many, sizeof(many), "module Scaling {\n");
  for (unsigned i = 0; i < 512; i++) length += (size_t)snprintf(many + length, sizeof(many) - length, "pure val value%u = %u + 1\n", i, i);
  length += (size_t)snprintf(many + length, sizeof(many) - length, "}\n");
  Input input = at(many, length, 0);
  assert(q_scan_document(scanner, &input.lexer));
  scanner->recovering = true;
  size_t lookups = 0, advances = 0;
  for (size_t i = 0; i < scanner->document.token_count; i++) {
    input = at(many, length, scanner->document.tokens[i].start);
    assert(q_token_position(scanner, &input.lexer, 0) == i);
    lookups++; advances += input.advances;
  }
  fprintf(stderr, "%zu lookups: %zu characters read (budget %zu)\n", lookups, advances, lookups * 64);
  assert(advances < lookups * 64);
  // A speculative boundary sequence must restore both its stack and position.
  scanner->recovering = false;
  QBoundary boundary = scanner->document.boundaries[0];
  assert(q_begin_definition(scanner, boundary.start, boundary.kind));
  char state[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned state_length = tree_sitter_quint_external_scanner_serialize(scanner, state);
  uint32_t saved_stack = scanner->stack;
  assert(q_end_definition(scanner, boundary.end, boundary.kind));
  assert(scanner->position == boundary.end);
  tree_sitter_quint_external_scanner_deserialize(scanner, state, state_length);
  assert(scanner->stack == saved_stack && scanner->position == boundary.start);
  // Entering recovery stays conservative even when GLR restores an older state.
  scanner->recovering = true;
  tree_sitter_quint_external_scanner_deserialize(scanner, state, state_length);
  assert(scanner->recovering);
  uint32_t bad = UINT32_MAX;
  memcpy(state + sizeof(uint64_t) + sizeof(uint32_t), &bad, sizeof(bad));
  tree_sitter_quint_external_scanner_deserialize(scanner, state, state_length);
  assert(scanner->stack == 0 && scanner->position == 0);
  tree_sitter_quint_external_scanner_deserialize(scanner, NULL, 0);
  assert(scanner->stack == 0 && scanner->position == 0);
  // Rebuilding either index must clean up partial allocations and be retryable.
  free(scanner->suffixes); scanner->suffixes = NULL;
  free(scanner->suffix_ranks); scanner->suffix_ranks = NULL;
  free(scanner->positions); scanner->positions = NULL; scanner->position_count = 0;
  free(scanner->boundary_index); scanner->boundary_index = NULL;
  calls = 0;
  input = at(many, length, 0);
  assert(q_scan_document(scanner, &input.lexer));
  size_t sites = calls;
  for (size_t site = 1; site <= sites; site++) {
    free(scanner->suffixes); scanner->suffixes = NULL;
    free(scanner->suffix_ranks); scanner->suffix_ranks = NULL;
    free(scanner->positions); scanner->positions = NULL; scanner->position_count = 0;
    free(scanner->boundary_index); scanner->boundary_index = NULL;
    calls = 0; fail_at = site;
    input = at(many, length, 0);
    assert(!q_scan_document(scanner, &input.lexer));
    fail_at = 0;
    input = at(many, length, 0);
    assert(q_scan_document(scanner, &input.lexer));
    assert(scanner->suffixes && scanner->suffix_ranks && scanner->positions && scanner->boundary_index);
  }
  fprintf(stderr, "position index allocation failures: %zu retry sites pass\n", sites);
  tree_sitter_quint_external_scanner_destroy(scanner);
  assert(live == 0);
  puts("scanner position contract and lookup-work budget pass");
  return 0;
}
