#include "tree_sitter/parser.h"

#include <stdbool.h>

enum TokenType {
  NEWLINE,
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

  if (!valid_symbols[NEWLINE]) {
    return false;
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead == '\r') {
    lexer->advance(lexer, false);
  }

  if (lexer->lookahead != '\n') {
    return false;
  }

  lexer->advance(lexer, false);

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead == '.') {
    return false;
  }

  lexer->result_symbol = NEWLINE;
  return true;
}
