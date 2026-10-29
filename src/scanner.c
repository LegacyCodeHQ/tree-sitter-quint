#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <string.h>

enum TokenType {
  NEWLINE,
};

static bool is_identifier_character(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_';
}

// Look past whitespace and comments without extending the newline token.
// A slash that is not a comment is a division continuation instead.
static bool skip_trivia(TSLexer *lexer) {
  for (;;) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
           lexer->lookahead == '\r' || lexer->lookahead == '\n') {
      lexer->advance(lexer, true);
    }
    if (lexer->lookahead != '/') {
      return true;
    }
    lexer->advance(lexer, true);
    if (lexer->lookahead == '/') {
      while (!lexer->eof(lexer) && lexer->lookahead != '\n' &&
             lexer->lookahead != '\r') {
        lexer->advance(lexer, true);
      }
    } else if (lexer->lookahead == '*') {
      lexer->advance(lexer, true);
      bool closed = false;
      while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '*') {
          lexer->advance(lexer, true);
          if (lexer->lookahead == '/') {
            lexer->advance(lexer, true);
            closed = true;
            break;
          }
        } else {
          lexer->advance(lexer, true);
        }
      }
      if (!closed) {
        return false;
      }
    } else {
      return false;
    }
  }
}

static bool expression_continues(TSLexer *lexer) {
  switch (lexer->lookahead) {
    case '.': case '[': case '(':
    case '+': case '-': case '*': case '/': case '%': case '^':
    case '<': case '>': case '!': case '=': case ':': case '\'':
      return true;
  }

  char word[8] = {0};
  unsigned length = 0;
  while (is_identifier_character(lexer->lookahead)) {
    if (length < sizeof(word) - 1) {
      word[length] = (char)lexer->lookahead;
    }
    length++;
    lexer->advance(lexer, true);
  }
  return length < sizeof(word) &&
         (strcmp(word, "and") == 0 || strcmp(word, "or") == 0 ||
          strcmp(word, "iff") == 0 || strcmp(word, "implies") == 0 ||
          strcmp(word, "leadsTo") == 0);
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

  if (!valid_symbols[NEWLINE]) {
    return false;
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead == '\r') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
    }
  } else if (lexer->lookahead == '\n') {
    lexer->advance(lexer, false);
  } else {
    return false;
  }
  lexer->mark_end(lexer);

  if (!skip_trivia(lexer) || expression_continues(lexer)) {
    return false;
  }

  lexer->result_symbol = NEWLINE;
  return true;
}
