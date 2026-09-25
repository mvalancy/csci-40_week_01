// Pure arena math, shared by the render loop and deterministic combat tests.
export function angleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
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
