#include "tree_sitter/parser.h"

#include <stdbool.h>
#include "quint_scanner_boundary_state.h"

enum TokenType {
  DIVISION,
  REFERENCE_BOUNDARIES,
  RECOVERY_BOUNDARIES,
  BEGIN_DEFINITION,
  END_DEFINITION,
  BEGIN_DECLARATION,
  END_DECLARATION,
  NUL_STRING_LITERAL,
  NUL_COMMENT,
  NUL_DOCUMENTATION_COMMENT,
  NUL_HASHBANG,
  CHAIN_BREAK,
  OPERATOR_BREAK,
  ERROR_SENTINEL,
};

// Helper functions for line-break scanner
static bool is_ident_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
         c == '_';
}

// Consumes `word` and checks that it is not just the prefix of a longer identifier.
static bool scan_word(TSLexer *lexer, const char *word) {
  for (; *word; word++) {
    if (lexer->lookahead != *word) {
      return false;
    }
    lexer->advance(lexer, false);
  }
  return !is_ident_char(lexer->lookahead);
}

// Whether the next line continues the expression with a binary operator. `and {` / `or {`
// start a block combinator and a leading `-` is a negation, thus both start a new expression.
static bool continues_with_binary_operator(TSLexer *lexer) {
  switch (lexer->lookahead) {
    case '+':
    case '*':
    case '%':
    case '^':
    case '<':
    case '>':
      return true;
    case '/':
      lexer->advance(lexer, false);
      return lexer->lookahead != '/' && lexer->lookahead != '*';
    case '=':
    case '!':
      lexer->advance(lexer, false);
      return lexer->lookahead == '=';
    case 'i':
      lexer->advance(lexer, false);
      if (lexer->lookahead == 'f') {
        return scan_word(lexer, "ff");
      }
      return scan_word(lexer, "mplies");
    case 'l':
      return scan_word(lexer, "leadsTo");
    case 'a':
    case 'o':
      if (!scan_word(lexer, lexer->lookahead == 'a' ? "and" : "or")) {
        return false;
      }
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        lexer->advance(lexer, false);
      }
      return lexer->lookahead != '{';
    default:
      return false;
  }
}

// Skips whitespace, line breaks and `//` comments.
static void skip_blank_and_comment_lines(TSLexer *lexer) {
  for (;;) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r' ||
           lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead != '/') {
      return;
    }
    lexer->advance(lexer, false);
    if (lexer->lookahead != '/') {
      return;
    }
    while (lexer->lookahead != '\n' && !lexer->eof(lexer)) {
      lexer->advance(lexer, false);
    }
  }
}

// Tree-sitter's generated lexer excludes NUL even from negated character
// classes. Recognize only tokens containing NUL here; the generated lexer
// continues to handle ordinary strings and comments, including EOF allowances.
static bool scan_nul_token(TSLexer *lexer, const bool *valid_symbols, unsigned *doc_prefix) {
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
        if (doc_prefix && (valid_symbols[END_DEFINITION] || valid_symbols[END_DECLARATION])) {
          *doc_prefix = 2;
          return false;
        }
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
  return calloc(1, sizeof(QScanner));
}

void tree_sitter_quint_external_scanner_destroy(void *payload) {
  QScanner *scanner = payload;
  q_document_destroy(&scanner->document);
  free(scanner->source);
  free(scanner->suffixes);
  free(scanner->suffix_ranks);
  free(scanner->positions);
  free(scanner->stacks);
  free(scanner->boundary_index);
  free(scanner->stack_slots);
  free(scanner);
}

unsigned tree_sitter_quint_external_scanner_serialize(void *payload, char *buffer) {
  QScanner *scanner = payload;
  memcpy(buffer, &scanner->fingerprint, sizeof(uint64_t));
  memcpy(buffer + sizeof(uint64_t), &scanner->stack, sizeof(uint32_t));
  memcpy(buffer + sizeof(uint64_t) + sizeof(uint32_t), &scanner->position, sizeof(uint32_t));
  return sizeof(uint64_t) + 2 * sizeof(uint32_t);
}

void tree_sitter_quint_external_scanner_deserialize(
  void *payload,
  const char *buffer,
  unsigned length
) {
  QScanner *scanner = payload;
  scanner->stack = 0;
  scanner->position = 0;
  if (length == sizeof(uint64_t) + 2 * sizeof(uint32_t)) {
    uint64_t fingerprint;
    uint32_t stack;
    memcpy(&fingerprint, buffer, sizeof(uint64_t));
    memcpy(&stack, buffer + sizeof(uint64_t), sizeof(uint32_t));
    uint32_t position;
    memcpy(&position, buffer + sizeof(uint64_t) + sizeof(uint32_t), sizeof(uint32_t));
    if (fingerprint == scanner->fingerprint && stack <= scanner->stack_count &&
        position < scanner->document.token_count) {
      scanner->stack = stack;
      scanner->position = position;
    }
  }
}

bool tree_sitter_quint_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  QScanner *scanner = payload;
  
  // Line-break tokens are zero-width and only apply at a line break; anywhere
  // else the other external tokens must still be scanned.
  // Every external token is valid during error recovery; leave it to the scanners below.
  if (!valid_symbols[ERROR_SENTINEL] && (valid_symbols[CHAIN_BREAK] || valid_symbols[OPERATOR_BREAK])) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
           lexer->lookahead == '\r') {
      lexer->advance(lexer, true);
    }
    const bool boundary_valid =
        valid_symbols[REFERENCE_BOUNDARIES] || valid_symbols[RECOVERY_BOUNDARIES] ||
        valid_symbols[BEGIN_DEFINITION] || valid_symbols[END_DEFINITION] ||
        valid_symbols[BEGIN_DECLARATION] || valid_symbols[END_DECLARATION];
    if (lexer->lookahead == '\n' && !boundary_valid) {
      lexer->mark_end(lexer);
      // A binary operator ending the line.
      if (valid_symbols[OPERATOR_BREAK]) {
        lexer->result_symbol = OPERATOR_BREAK;
        return true;
      }
      lexer->advance(lexer, false);
      skip_blank_and_comment_lines(lexer);
      // A line starting with `.` continues the expression as a method chain, but `...` is a spread.
      if (lexer->lookahead == '.') {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '.') return false;
        lexer->result_symbol = CHAIN_BREAK;
        return true;
      }
      return false;
    }
  }

  // Recovery exposes every external token at once. Boundary markers must not
  // suppress Tree-sitter's normal error recovery in that mode.
  if (valid_symbols[REFERENCE_BOUNDARIES] && valid_symbols[BEGIN_DEFINITION]) scanner->recovering = true;
  if (!(valid_symbols[REFERENCE_BOUNDARIES] && valid_symbols[BEGIN_DEFINITION])) {
    if (valid_symbols[REFERENCE_BOUNDARIES] || valid_symbols[RECOVERY_BOUNDARIES]) {
      if (!q_scan_document(scanner, lexer)) return false;
      lexer->result_symbol = scanner->recognized ? REFERENCE_BOUNDARIES : RECOVERY_BOUNDARIES;
      if (!valid_symbols[lexer->result_symbol]) return false;
      return true;
    }
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
           lexer->lookahead == '\r' || lexer->lookahead == '\n') lexer->advance(lexer, true);
    unsigned doc_prefix = 0;
    if (lexer->lookahead == '/') {
      lexer->mark_end(lexer);
      bool result = scan_nul_token(lexer, valid_symbols, &doc_prefix);
      if (!doc_prefix) return result;
    }
    if (valid_symbols[END_DEFINITION] || valid_symbols[END_DECLARATION] ||
        valid_symbols[BEGIN_DEFINITION] || valid_symbols[BEGIN_DECLARATION]) {
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
             lexer->lookahead == '\r' || lexer->lookahead == '\n') lexer->advance(lexer, true);
      bool comment = lexer->lookahead == '/';
      if (scanner->recognized && scanner->recovering &&
          !q_end_may_match(scanner, lexer, doc_prefix,
                          valid_symbols[END_DEFINITION], valid_symbols[END_DECLARATION]) &&
          (comment || !q_begin_may_match(scanner, lexer,
                          valid_symbols[BEGIN_DEFINITION], valid_symbols[BEGIN_DECLARATION]))) return false;
      uint32_t position = q_token_position(scanner, lexer, doc_prefix);
      if (valid_symbols[END_DEFINITION] && q_end_definition(scanner, position, 4)) {
        lexer->result_symbol = END_DEFINITION; return true;
      }
      if (valid_symbols[END_DECLARATION] && q_end_definition(scanner, position, 3)) {
        lexer->result_symbol = END_DECLARATION; return true;
      }
      if (!comment && valid_symbols[BEGIN_DECLARATION] && q_begin_definition(scanner, position, 3)) {
        lexer->result_symbol = BEGIN_DECLARATION; return true;
      }
      if (!comment && valid_symbols[BEGIN_DEFINITION] && q_begin_definition(scanner, position, 4)) {
        lexer->result_symbol = BEGIN_DEFINITION; return true;
      }
      return false;
    }
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    lexer->advance(lexer, true);
  }
  return scan_nul_token(lexer, valid_symbols, NULL);
}
