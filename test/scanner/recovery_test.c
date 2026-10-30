#define main repeated_contract_main
#include "repeated_test.c"
#undef main

int main(void) {
  char source[32768];
  for (unsigned size = 128; size <= 512; size *= 4) {
    for (unsigned line = 0; line < 2; line++) {
      for (unsigned location = 0; location < 3; location++) {
        unsigned error_at = location == 0 ? 0 : location == 1 ? size / 2 : size - 1;
        size_t length = (size_t)snprintf(source, sizeof(source), "module Recovery {\n");
        for (unsigned i = 0; i < size; i++) length += (size_t)snprintf(source + length,
          sizeof(source) - length, "pure val %s = 1 + 1%c", i == error_at ? "match" : "same", line ? '\n' : ' ');
        length += (size_t)snprintf(source + length, sizeof(source) - length, "}\n");
        TSParser *parser = ts_parser_new();
        assert(ts_parser_set_language(parser, tree_sitter_quint()));
        advances = recovery_lookups = 0;
        TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)length);
        assert(tree && ts_node_has_error(ts_tree_root_node(tree)));
        fprintf(stderr, "%u definitions, line mode %u, error at %u: %zu recovery lookups, %zu reads\n",
          size, line, error_at, recovery_lookups, advances);
        // This bounds unnecessary position lookups, not the remaining cost of
        // distinguishing identical suffixes. Recovery trees must stay intact.
        assert(recovery_lookups < size * 2 + 16);
        ts_tree_delete(tree); ts_parser_delete(parser);
      }
    }
  }
}
