#include "tree_sitter/parser.h"

#include <stdbool.h>

enum TokenType {
  DIVISION,
  NUL_STRING_LITERAL,
  NUL_COMMENT,
  NUL_DOCUMENTATION_COMMENT,
  NUL_HASHBANG,
};

// Tree-sitter's generated lexer excludes NUL even from negated character
// classes. Recognize only tokens containing NUL here; the generated lexer
// continues to handle ordinary strings and comments, including EOF allowances.
static bool scan_nul_token(TSLexer *lexer, const bool *valid_symbols) {
  enum TokenType symbol;
  bool block = false;
  bool string = false;
  bool contains_nul = false;

  if (lexer->lookahead == '"' && valid_symbols[NUL_STRING_LITERAL]) {
    symbol = NUL_STRING_LITERAL;
    string = true;
    lexer->advance(lexer, false);
  } else if (lexer->lookahead == '#' && valid_symbols[NUL_HASHBANG]) {
    symbol = NUL_HASHBANG;
    lexer->advance(lexer, false);
    if (lexer->lookahead != '!') return false;
    lexer->advance(lexer, false);
  } else if (lexer->lookahead == '/') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '*') {
      if (!valid_symbols[NUL_COMMENT]) return false;
      symbol = NUL_COMMENT;
      block = true;
      lexer->advance(lexer, false);
    } else if (lexer->lookahead == '/') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '/') {
        if (!valid_symbols[NUL_DOCUMENTATION_COMMENT]) return false;
        symbol = NUL_DOCUMENTATION_COMMENT;
      } else {
        if (!valid_symbols[NUL_COMMENT]) return false;
        symbol = NUL_COMMENT;
      }
    } else {
      if (!valid_symbols[DIVISION]) return false;
      lexer->mark_end(lexer);
      lexer->result_symbol = DIVISION;
      return true;
    }
  } else {
    return false;
  }

  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    if (character == 0) contains_nul = true;
    lexer->advance(lexer, false);
    if ((string && character == '"') ||
        (!string && !block && character == '\n')) {
      if (!contains_nul) return false;
      lexer->mark_end(lexer);
      lexer->result_symbol = symbol;
      return true;
    }
    if (block && character == '*' && lexer->lookahead == '/') {
      lexer->advance(lexer, false);
      if (!contains_nul) return false;
      lexer->mark_end(lexer);
      lexer->result_symbol = symbol;
      return true;
    }
  }
  if (string || block || !contains_nul) return false;
  lexer->mark_end(lexer);
  lexer->result_symbol = symbol;
  return true;
}

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

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    lexer->advance(lexer, true);
  }
  return scan_nul_token(lexer, valid_symbols);
}
