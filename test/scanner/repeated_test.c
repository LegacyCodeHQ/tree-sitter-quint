#include <assert.h>
#include <stdio.h>
#include "tree_sitter/api.h"
#include "lexer.h"
#include "../../src/quint_scanner_boundary_state.h"
// The real runtime exposes its absolute cursor to this diagnostic only. Compare
// every optimized lookup, including speculative calls, to that independent oracle.
static size_t recovery_lookups;
static uint32_t checked_position(QScanner *scanner, TSLexer *lexer, unsigned prefix) {
  if (scanner->recovering) recovery_lookups++;
  size_t offset = ((Lexer *)lexer)->current_position.bytes - prefix;
  uint32_t expected = UINT32_MAX;
  for (size_t i = 0; i < scanner->document.token_count; i++) {
    QToken t = scanner->document.tokens[i];
    if (t.end > offset || t.kind == -1) { expected = (uint32_t)i; break; }
  }
  uint32_t actual = q_token_position(scanner, lexer, prefix);
  if (actual != expected) fprintf(stderr, "position at byte %zu: got %u, expected %u\n", offset, actual, expected);
  assert(actual == expected);
  assert(((Lexer *)lexer)->token_end_position.bytes == offset);
  return actual;
}
#define q_token_position checked_position
#define tree_sitter_quint_external_scanner_scan uncounted_scan
#include "../../src/scanner.c"
#undef tree_sitter_quint_external_scanner_scan
#undef q_token_position
static size_t advances;
static void (*original_advance)(TSLexer *, bool);
static void counting_advance(TSLexer *lexer, bool skip) {
  advances++;
  original_advance(lexer, skip);
}
bool tree_sitter_quint_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid) {
  original_advance = lexer->advance;
  lexer->advance = counting_advance;
  bool result = uncounted_scan(payload, lexer, valid);
  lexer->advance = original_advance;
  return result;
}
extern const TSLanguage *tree_sitter_quint(void);
static void parse_file(const char *path) {
  FILE *file = fopen(path, "rb"); assert(file);
  assert(!fseek(file, 0, SEEK_END)); long length = ftell(file); assert(length >= 0);
  rewind(file); char *source = malloc((size_t)length + 1); assert(source);
  assert(fread(source, 1, (size_t)length, file) == (size_t)length); fclose(file);
  TSParser *parser = ts_parser_new();
  assert(ts_parser_set_language(parser, tree_sitter_quint()));
  TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)length);
  assert(tree);
  ts_tree_delete(tree); ts_parser_delete(parser); free(source);
}
int main(int argc, char **argv) {
  static char source[131072];
  const unsigned sizes[] = {128, 512, 2048};
  for (size_t size = 0; size < sizeof(sizes) / sizeof(sizes[0]); size++) {
    for (unsigned line = 0; line < 2; line++) {
      size_t length = (size_t)snprintf(source, sizeof(source), "module Repeated {\n");
      for (unsigned i = 0; i < sizes[size]; i++) length += (size_t)snprintf(source + length,
        sizeof(source) - length, "pure val same = 1 + 1%c", line ? '\n' : ' ');
      length += (size_t)snprintf(source + length, sizeof(source) - length, "}\n");
      TSParser *parser = ts_parser_new();
      assert(ts_parser_set_language(parser, tree_sitter_quint()));
      advances = 0;
      TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)length);
      assert(tree && !ts_node_has_error(ts_tree_root_node(tree)));
      fprintf(stderr, "%u definitions, %s repetition: %zu scanner reads / %zu bytes (budget %zu)\n",
        sizes[size], line ? "multiline" : "single-line", advances, length, length * 64);
      assert(advances < length * 64);
      ts_tree_delete(tree); ts_parser_delete(parser);
    }
  }
  for (int i = 1; i < argc; i++) parse_file(argv[i]);
  puts("repeated-definition work budget and real-runtime position oracle pass");
  return 0;
}
