module BadLocalRecord { pure def f() = { val {a, b}: {a: int, b: int} = {a: 1, b: 2}; a } }
