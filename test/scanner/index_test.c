// Exercise real recognized boundaries in reverse order, as speculative parser
// branches do. Count search work independently of machine timing.
#define main position_contract_main
#define Q_INDEX_STEP() (index_steps++)
#include <stddef.h>
static size_t index_steps;
#include "position_test.c"
#undef main

int main(void) {
  char *source = malloc(262144);
  size_t length = (size_t)snprintf(source, 262144, "module Indexed {\n");
  for (unsigned i = 0; i < 4096; i++)
    length += (size_t)snprintf(source + length, 262144 - length, "pure val value%u = %u + 1\n", i, i);
  length += (size_t)snprintf(source + length, 262144 - length, "}\n");
  QScanner *scanner = tree_sitter_quint_external_scanner_create();
  Input input = at(source, length, 0);
  assert(q_scan_document(scanner, &input.lexer) && scanner->recognized);
  size_t count = scanner->document.boundary_count;
  index_steps = 0;
  for (unsigned pass = 0; pass < 3; pass++) {
    for (size_t i = count; i > 0; i--) {
      QBoundary b = scanner->document.boundaries[i - 1];
      scanner->stack = 0;
      assert(q_begin_definition(scanner, b.start, b.kind));
      uint32_t id = scanner->stack;
      assert(!q_end_definition(scanner, UINT32_MAX, b.kind));
      assert(scanner->stack == id);
      assert(q_end_definition(scanner, b.end, b.kind));
      assert(scanner->stack == 0);
      // Re-entering a branch must retain the original serialized ID.
      assert(q_begin_definition(scanner, b.start, b.kind));
      assert(scanner->stack == id);
      assert(q_end_definition(scanner, b.end, b.kind));
    }
  }
  size_t budget = count * 3 * 128;
  fprintf(stderr, "boundary/stack searches: %zu steps, budget %zu\n", index_steps, budget);
  assert(index_steps < budget);
  // Compare prefix and exact queries with the original unordered reference
  // boundaries, including absent kinds and end positions.
  for (size_t i = 0; i < count; i += 31) {
    QBoundary b = scanner->document.boundaries[i];
    for (uint8_t kind = 2; kind <= 5; kind++) {
      bool prefix = false, exact = false;
      for (size_t j = 0; j < count; j++) {
        QBoundary other = scanner->document.boundaries[j];
        if (other.start == b.start && other.kind == kind) {
          prefix = true;
          if (other.end == b.end) exact = true;
        }
      }
      assert(q_has_boundary(scanner, b.start, kind, 0, false) == prefix);
      assert(q_has_boundary(scanner, b.start, kind, b.end, true) == exact);
    }
  }
  // Stack interning also operates on rejected input. Exercise nested parents,
  // collisions, growth, failed allocations and retry without publishing an ID.
  tree_sitter_quint_external_scanner_destroy(scanner);
  scanner = tree_sitter_quint_external_scanner_create();
  calls = 0;
  for (uint32_t i = 0; i < 4096; i++) assert(q_begin_definition(scanner, i, 4));
  size_t allocation_sites = calls;
  tree_sitter_quint_external_scanner_destroy(scanner);
  for (size_t site = 1; site <= allocation_sites; site++) {
    scanner = tree_sitter_quint_external_scanner_create();
    calls = 0; fail_at = site;
    for (uint32_t i = 0; i < 4096; i++) {
      uint32_t parent = scanner->stack;
      if (!q_begin_definition(scanner, i, 4)) {
        assert(scanner->stack == parent);
        fail_at = 0;
        assert(q_begin_definition(scanner, i, 4));
      }
      uint32_t id = scanner->stack;
      scanner->stack = parent;
      assert(q_begin_definition(scanner, i, 4) && scanner->stack == id);
    }
    fail_at = 0;
    tree_sitter_quint_external_scanner_destroy(scanner);
  }
  fprintf(stderr, "stack allocation failures: %zu retry sites pass\n", allocation_sites);
  // Changed documents must clear interned keys, even when storage is reused.
  scanner = tree_sitter_quint_external_scanner_create();
  input = at(source, length, 0);
  assert(q_scan_document(scanner, &input.lexer));
  QBoundary first = scanner->document.boundaries[0];
  assert(q_begin_definition(scanner, first.start, first.kind));
  input = at("module Empty {}", 15, 0);
  assert(q_scan_document(scanner, &input.lexer));
  assert(scanner->stack_count == 0);
  input = at(source, length, 0);
  assert(q_scan_document(scanner, &input.lexer));
  assert(q_begin_definition(scanner, first.start, first.kind));
  assert(scanner->stack == 1);
  tree_sitter_quint_external_scanner_destroy(scanner);
  free(source);
  assert(live == 0);
}
