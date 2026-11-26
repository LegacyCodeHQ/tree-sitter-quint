module invariant {
  def observation(invariant) = invariant
  val observationReady = observation(true)
}
module Use {
  import invariant as observation
  invariant invariant = observation::observation(true)
  observation seen = invariant
}
