/** Pure vertical integration. Bike y is the tire contact point, not its center. */
export function stepVertical(state, floor, dt, options = {}) {
  const gravity = options.gravity ?? 22;
  const attachment = options.attachment ?? .25;
  const maxStepUp = options.maxStepUp ?? 2.5;
  const launchThreshold = options.launchThreshold ?? 1;
  const step = Math.max(0, Math.min(dt, .1));
  let y = state.y, vy = state.vy ?? 0;
  let grounded = state.grounded ?? Math.abs(y - floor) < .01;
  let landed = false, impact = 0;
  const previousFloor = state.previousFloor ?? y;
  const floorDelta = floor - previousFloor;
  const slopeVelocity = step > 0 ? floorDelta / step : 0;
  if (!step) return { y, vy, grounded, previousFloor, landed, impact };

  if (grounded && floor >= y - attachment && floor <= y + maxStepUp) {
    // A rising-to-flat transition releases the momentum from the ascent.
    // Detect the partially crossed crest too, so launch does not depend on
    // whether a simulation tick lands exactly on the end of the incline.
    const crest = vy > launchThreshold && floorDelta >= -1e-6 && slopeVelocity < vy * .8;
    if (!crest) {
      y = floor; vy = floorDelta > 0 ? Math.min(slopeVelocity, 12) : 0;
      return { y, vy, grounded: true, previousFloor: floor, landed, impact };
    }
    grounded = false;
  } else grounded = false;

  vy -= gravity * step;
  y += vy * step;
  if (y <= floor) {
    landed = true; impact = Math.max(0, -vy);
    y = floor; vy = 0; grounded = true;
  }
  return { y, vy, grounded, previousFloor: floor, landed, impact };
}
