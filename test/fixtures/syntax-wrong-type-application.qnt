module WrongTypeApplication {
  type Box[a] = List[a]
  const value: Box(int)
}
