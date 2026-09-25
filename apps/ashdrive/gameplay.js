// Pure arena math, shared by the render loop and deterministic combat tests.
export function angleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

// Share this selection between the weapons and their HUD marker. Groups avoid
// concatenating enemy/relay arrays each frame, and obstruction checks only run
// for live in-cone candidates close enough to replace the current lock.
export function selectVisibleTarget(origin, heading, targetGroups, {
  maxAngle = Math.PI,
  maxRange = 220,
  isBlocked,
} = {}) {
  let bestTarget = null, bestDistanceSquared = Infinity, bestAngle = 0;
  const rangeSquared = maxRange * maxRange;
  for (const targets of targetGroups) {
    for (const target of targets) {
      if (!(target.health > 0) || target.destroyed || target.recovered || target.visible === false || target.mesh?.visible === false) continue;
      const position = target.mesh?.position || target.position;
      if (!position) continue;
      const dx = position.x - origin.x, dy = (position.y ?? 0) - (origin.y ?? 0), dz = position.z - origin.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (!Number.isFinite(distanceSquared) || distanceSquared < 1e-8 || distanceSquared > rangeSquared || distanceSquared >= bestDistanceSquared) continue;
      const angle = Math.atan2(-dx, -dz);
      if (Math.abs(angleDelta(angle, heading)) > maxAngle) continue;
      if (isBlocked?.(origin, position, target)) continue;
      bestTarget = target; bestDistanceSquared = distanceSquared; bestAngle = angle;
    }
  }
  return bestTarget ? { target: bestTarget, distance: Math.sqrt(bestDistanceSquared), angle: bestAngle } : null;
}

// Swept collision in all three dimensions: the skyway and ground share X/Z,
// so a projectile must also be at the target's altitude to cause damage.
export function segmentHit3D(from, to, target, radius) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const projection = lengthSquared > 0
    ? ((target.x - from.x) * dx + (target.y - from.y) * dy + (target.z - from.z) * dz) / lengthSquared
    : 0;
  const t = Math.max(0, Math.min(1, projection));
  const x = from.x + dx * t - target.x;
  const y = from.y + dy * t - target.y;
  const z = from.z + dz * t - target.z;
  return x * x + y * y + z * z <= radius * radius;
}

// Test the complete projectile path, so a fast bolt cannot skip a small target.
// Arena collisions deliberately use X/Z: hover animation must not affect hits.
export function sweptHit(from, to, target, radius) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection = lengthSquared > 0
    ? ((target.x - from.x) * dx + (target.z - from.z) * dz) / lengthSquared
    : 0;
  const t = Math.max(0, Math.min(1, projection));
  return Math.hypot(from.x + dx * t - target.x, from.z + dz * t - target.z) <= radius;
}

// A restrained aim magnet keeps keyboard steering satisfying without allowing
// a shot to snap to targets behind the rider. Input and result are bike headings.
export function assistedHeading(origin, heading, targets, cone = .11, range = 85) {
  let best = null;
  for (const target of targets) {
    const distance = Math.hypot(target.x - origin.x, target.z - origin.z);
    if (distance > range || distance < .01) continue;
    const angle = Math.atan2(origin.x - target.x, origin.z - target.z);
    const difference = Math.abs(angleDelta(angle, heading));
    if (difference > cone) continue;
    // Prefer alignment over distance. This prevents a near edge-of-screen drone
    // stealing a shot aimed directly at a more distant drone.
    const rank = difference + distance * .0001;
    if (!best || rank < best.rank) best = { angle, rank };
  }
  return best ? heading + angleDelta(best.angle, heading) : heading;
}

// Moving-target lead for optional autopilot; falls back to direct aim whenever
// the target cannot be intercepted at this projectile speed.
export function interceptHeading(origin, target, velocity, projectileSpeed) {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const a = velocity.x ** 2 + velocity.z ** 2 - projectileSpeed ** 2;
  const b = 2 * (dx * velocity.x + dz * velocity.z);
  const c = dx * dx + dz * dz;
  let time = 0;
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) > 1e-8) time = Math.max(0, -c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const positive = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(t => t >= 0);
      if (positive.length) time = Math.min(...positive);
    }
  }
  return Math.atan2(-dx - velocity.x * time, -dz - velocity.z * time);
}

// Earliest impact along a swept projectile, for ordering cover and targets.
export function segmentSphereT(from, to, center, radius) {
  const ox = from.x - center.x, oy = from.y - center.y, oz = from.z - center.z;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a <= Number.EPSILON) return null;
  const halfB = ox * dx + oy * dy + oz * dz;
  const discriminant = halfB * halfB - a * c;
  if (discriminant < 0) return null;
  const t = (-halfB - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
