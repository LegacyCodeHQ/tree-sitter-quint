// Count scanner allocations across real parse lifecycles, not just payload reuse.
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "tree_sitter/api.h"
#include "allocations.h"
#include "../../src/scanner.c"
#undef malloc
#undef calloc
#undef realloc
#undef free
extern const TSLanguage *tree_sitter_quint(void);
static void parse(const char *source) {
  TSParser *parser = ts_parser_new();
  assert(ts_parser_set_language(parser, tree_sitter_quint()));
  TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)strlen(source));
  assert(tree && !ts_node_has_error(ts_tree_root_node(tree)));
  ts_tree_delete(tree); ts_parser_delete(parser);
  assert(live == 0);
}
int main(void) {
  char source[32768];
  size_t length = (size_t)snprintf(source, sizeof(source), "module Reuse {\n");
  for (unsigned i = 0; i < 512; i++) length += (size_t)snprintf(source + length,
    sizeof(source) - length, "pure val value%u = %u + 1\n", i, i);
  length += (size_t)snprintf(source + length, sizeof(source) - length, "}\n");
  parse(source);
  // A different document and fresh parser share kinds, but not bytes/offsets.
  char renamed[32800];
  snprintf(renamed, sizeof(renamed), "/* new document */\n%s", source);
  calls = requested = 0;
  parse(renamed);
  fprintf(stderr, "fresh scanner reuse: %zu allocations, %zu requested bytes\n", calls, requested);
#ifdef Q_RECOGNITION_CACHE_ENABLED
  assert(calls < 64);
  // Token storage and cached-boundary copying must fail without leaks or stale
  // success. The immutable cache must remain usable by the next fresh document.
  QDocument doc = {0}; calls = requested = 0;
  assert(q_parse_document_cached(&doc, source, length));
  size_t sites = calls;
  q_document_destroy(&doc); assert(live == 0);
  for (size_t site = 1; site <= sites; site++) {
    doc = (QDocument){0}; calls = requested = 0; fail_at = site;
    assert(!q_parse_document_cached(&doc, source, length));
    q_document_destroy(&doc); assert(live == 0);
    fail_at = 0; doc = (QDocument){0};
    assert(q_parse_document_cached(&doc, source, length));
    q_document_destroy(&doc); assert(live == 0);
  }
  fprintf(stderr, "cached recognition allocation failures: %zu sites pass\n", sites);
#endif
  return 0;
}
