module BadLocalTuple { pure def f() = { val (a, b): (int, int) = (1, 2); a } }
