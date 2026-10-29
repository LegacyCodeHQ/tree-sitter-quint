module InvalidWildcard { type T = A(int) | B pure def f(v: T): int = match v { _(x) => x } }
