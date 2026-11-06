; The scopes config.toml names in `not_in`: inside a string or a comment, Zed
; does not close a quote or a block comment that is typed.

(string_literal) @string

[
  (comment)
  (documentation_comment)
] @comment
