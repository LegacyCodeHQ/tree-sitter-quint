# Subtraction and unary local bodies

Artifacts: `/private/tmp/quint-minus-20261030`. This follows the
[local-header experiment](local-header-lookahead.md). Production grammar and
scanner behavior remain unchanged; the two new corpus regressions and their
incremental edit/undo pair preserve the required boundary.

The exact two temporary programs passed both Quint 0.33 `parse` and `typecheck`:

```quint
module Minus { pure val seed = 1 pure def result = { val saved = seed
-seed
} }
```

```quint
module Minus { pure val seed = 1 pure def result = { val saved = seed
-seed
seed
} }
```

Without the final `seed`, subtracting inside the initializer would leave no
local body. ANTLR therefore ends the initializer at the first `seed` and uses
`-seed` as a unary body. With the extra expression, the initializer consumes
the subtraction and the last `seed` supplies the body. A suffix edit changes
an earlier definition boundary. Newlines alone do not delimit definitions.

The header-only unguarded prototype fails the first case. Raising definition
precedence to the additive level and explicitly retaining definition/binary
conflicts makes both new cases pass. In the existing corpus it fixes five
expectations but breaks three previously matching expectations: assignment /
relation precedence, an integration program, and empty value parameters.
Its 36 remaining failures are not a safe improvement over the 38-failure base.

A second experiment duplicates only definitions followed by a minus-starting
body and preserves named nodes through symbol aliases. Both minimal cases
pass, but eager precedence on those productions still regresses two header
cases while fixing three other existing cases. Moving precedence to the
production completion avoids those header regressions but loses the required
minus alternative again. None of these variants ships.

The rejected variants and logs remain in the artifact directory. The new
production corpus tests are compiler-validated expectations, not revised
goldens for the failing prototypes. The edit test inserts/removes only the
trailing expression and compares trees and ranges with fresh parsing.

This family needs a way to retain its definition-end choice without applying
eager precedence to shared header prefixes or unrelated operators. Local-header
and operator-pair regressions remain required gates. Error-tree preservation
and the global recovery choice remain open constraints on guard removal.
