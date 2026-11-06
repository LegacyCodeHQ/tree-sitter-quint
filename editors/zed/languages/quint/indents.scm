; A bracketed node indents its contents until its closing bracket. The closing bracket is captured
; as @end for its own node: Zed reads only the previous row when indenting, so capturing every
; closing bracket as @outdent would outdent the line after any inline `(1, 2)` or `{ x: 1 }`.
(_ "{" "}" @end) @indent
(_ "[" "]" @end) @indent
(_ "(" ")" @end) @indent

; Nodes without brackets indent their continuation lines.
[
  (match_arm)
  (binary_expression)
  (pair_expression)
  (field_access_expression)
] @indent
