#include "tree_sitter/parser.h"

#include <stdbool.h>

enum TokenType {
  DIVISION,
};

void *tree_sitter_quint_external_scanner_create(void) {
  return NULL;
}

void tree_sitter_quint_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_quint_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_quint_external_scanner_deserialize(
  void *payload,
  const char *buffer,
  unsigned length
) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_quint_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  (void)payload;

  if (!valid_symbols[DIVISION]) {
    return false;
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    lexer->advance(lexer, true);
  }
  if (lexer->lookahead != '/') {
    return false;
  }

  lexer->advance(lexer, false);
  // Comments win over division, even where documentation is not permitted.
  if (lexer->lookahead == '/' || lexer->lookahead == '*') {
    return false;
  }
  lexer->mark_end(lexer);
  lexer->result_symbol = DIVISION;
  return true;
}
