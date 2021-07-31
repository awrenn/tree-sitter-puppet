#include <cwctype>
#include <iostream>
#include <string>
#include <tree_sitter/parser.h>

namespace {

using std::string;

enum TokenType {
  HEREDOC_HEADER,
  HEREDOC_TRIM_BORDER,
  HEREDOC_BODY,
  HEREDOC_END,
  HEREDOC_END_TRIM,
};

struct Scanner {
  void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

  void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

  unsigned serialize(char *buffer) {
    if (heredoc_delimiter.length() + 3 >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE)
      return 0;
    buffer[0] = started_heredoc;
    buffer[1] = heredoc_trim_indent;
    buffer[2] = read_body;
    heredoc_delimiter.copy(&buffer[3], heredoc_delimiter.length());
    return heredoc_delimiter.length() + 3;
  }

  void deserialize(const char *buffer, unsigned length) {
    if (length == 0) {
      started_heredoc = false;
      heredoc_trim_indent = false;
      read_body = false;
      heredoc_delimiter.clear();
    } else {
      started_heredoc = buffer[0];
      heredoc_trim_indent = buffer[1];
      read_body = buffer[2];
      heredoc_delimiter.assign(&buffer[3], &buffer[length]);
    }
  }

  void skip_spaces(TSLexer *lexer) {
    for (;;) {
      if (lexer->lookahead == ' ') {
        skip(lexer);
      } else {
        return;
      }
    }
  }

  void skip_dash(TSLexer *lexer) {
    if (lexer->lookahead == '-') {
      skip(lexer);
    }
  }

  void skip_line(TSLexer *lexer) {
    for (;;) {
      if (lexer->lookahead == '\n') {
        return;
      } else {
        skip(lexer);
      }
    }
  }

  const int32_t TerminatingSymbols[6] = {')', '/', '\\', ':', '\n', '"'};

  bool scan_header(TSLexer *lexer) {
    for (;;) {
      if (lexer->lookahead == 0) {
        return false;
      }
      for (int i = 0; i < (sizeof(TerminatingSymbols) / (sizeof(int32_t)));
           i++) {
        if (lexer->lookahead == TerminatingSymbols[i]) {
          if (heredoc_delimiter.length() == 0) {
            return false;
          }

          started_heredoc = true;
          lexer->result_symbol = HEREDOC_HEADER;
          return true;
        }
      }
      heredoc_delimiter += lexer->lookahead;
      skip(lexer);
    }
  }

  bool scan_trim_border(TSLexer *lexer) {
    // Look for the '   |' before the term word
    int count = 0;
    for (;;) {
      switch (lexer->lookahead) {
      case ' ':
        count++;
        advance(lexer);
        continue;
      case '|':
        advance(lexer);
        lexer->result_symbol = HEREDOC_TRIM_BORDER;
        return true;
      default:
        return false;
      }
      skip(lexer);
    }
  }

  bool scan_end(TSLexer *lexer, const bool *valid_symbols) {
    bool seen_dash = false;
    for (;;) {
      skip_spaces(lexer);
      switch (lexer->lookahead) {
      case 0:
        return false;
      case '-':
        if (seen_dash) {
          return false;
        }
        seen_dash = true;
        heredoc_trim_indent = true;
        skip(lexer);
        continue;
      default:
        // If we see a non space, non - dash character after the pipe, it
        // has to match the herdoc terminator exactly

        for (int i = 0; i < heredoc_delimiter.length(); i++) {
          if (heredoc_delimiter[i] != lexer->lookahead) {
            return false;
          }
          advance(lexer);
        }
        if (heredoc_trim_indent) {
          lexer->result_symbol = HEREDOC_END;
        } else {
          lexer->result_symbol = HEREDOC_END_TRIM;
        }
        heredoc_delimiter = "";
        return true;
      }
    }
  }

  // Without taking, skip to newline
  // then see if the first non-space character is a pipe. End on this line.
  bool scan_body(TSLexer *lexer) {
    string body;
    lexer->mark_end(lexer);
    bool newline = true;
    skip_line(lexer);
    for (;;) {
      switch (lexer->lookahead) {
      case '\n':
        newline = true;
        body += lexer->lookahead;
        advance(lexer);
        lexer->mark_end(lexer);
        continue;
      case '|':
        // Pass over the pipe
        skip(lexer);

        if (newline) {
          // We found our pipe as the first char on the line, now eat spaces
          // So now we should make sure our target word appears
          // If it doesn't, abort. We don't match.
          skip_spaces(lexer);
          skip_dash(lexer);
          skip_spaces(lexer);
          bool failed = false;
          for (int i = 0; i < heredoc_delimiter.length(); i++) {
            string s = string(1, lexer->lookahead);
            if (heredoc_delimiter[i] != lexer->lookahead) {
              failed = true;
              break;
            }
            skip(lexer);
          }

          if (failed) {
            newline = false;
            continue;
          }
          lexer->result_symbol = HEREDOC_BODY;
          return true;
        }
        body += lexer->lookahead;
        skip(lexer);
        continue;
      case 0:
        return false;
      case ' ':
        // skip, but don't taint
        body += lexer->lookahead;
        skip(lexer);
        continue;
      default:
        // taint this line
        newline = false;
        body += lexer->lookahead;
        skip(lexer);
        continue;
      }
    }
  }

  bool scan(TSLexer *lexer, const bool *valid_symbols) {
    // Grab the heredoc termination string.
    // There are couple of symbols that are listed as illegal herdoc delims
    // in puppet sytanx. If we get any of these illegal characters,
    // mark the current character as the end of the token
    //
    if (valid_symbols[HEREDOC_HEADER]) {
      return scan_header(lexer);
    }

    if (valid_symbols[HEREDOC_BODY] && !read_body) {
      return scan_body(lexer);
    }

    if (valid_symbols[HEREDOC_TRIM_BORDER]) {
      return scan_trim_border(lexer);
    }

    // Check to see if the current line is a heredoc terminator
    if (valid_symbols[HEREDOC_END] || valid_symbols[HEREDOC_END_TRIM]) {
      return scan_end(lexer, valid_symbols);
    }
  }
  string heredoc_delimiter;
  bool started_heredoc;
  bool read_body;
  bool heredoc_trim_indent;
};
} // namespace

extern "C" {

void *tree_sitter_puppet_external_scanner_create() {
  Scanner *s = new Scanner();
  s->started_heredoc = false;
  return s;
}

bool tree_sitter_puppet_external_scanner_scan(void *payload, TSLexer *lexer,
                                              const bool *valid_symbols) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  return scanner->scan(lexer, valid_symbols);
}

unsigned tree_sitter_puppet_external_scanner_serialize(void *payload,
                                                       char *state) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  return scanner->serialize(state);
}

void tree_sitter_puppet_external_scanner_deserialize(void *payload,
                                                     const char *state,
                                                     unsigned length) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  scanner->deserialize(state, length);
}

void tree_sitter_puppet_external_scanner_destroy(void *payload) {
  Scanner *scanner = static_cast<Scanner *>(payload);
  delete scanner;
}
}
