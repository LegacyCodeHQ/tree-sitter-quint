/// 😀 documentation before a module
module UnicodeSpans {
  pure val greeting = "😀"
  /* 😀 */ pure val reference = greeting
  action choose = { nondet selected = Set(1).oneOf(); selected == 1 }
  pure val tuple = ("😀", 1)
}
