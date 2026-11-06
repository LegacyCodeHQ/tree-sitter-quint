module Applications {
  type Option[a] = Some(a) | None
  var current: Option[int]
  //           ^^^^^^ type
}
