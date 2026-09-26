// Damped springs, described the way animators and vehicle engineers think:
// by natural frequency (how many wobbles per second) and damping ratio
// (0 = wobbles forever, 1 = settles as fast as possible without overshoot).
// Mass is normalised to 1, so the numbers are independent of object size.
import { TAU, fixedSteps } from './math.js';

/** Spring stiffness (per unit mass) for a natural frequency in Hz. */
export const stiffnessFor = (hz) => (TAU * hz) ** 2;
/** Damping coefficient (per unit mass) for a frequency and damping ratio. */
export const dampingFor = (hz, ratio) => 2 * ratio * TAU * hz;

/**
 * One semi-implicit Euler step of a 1D spring toward `target`.
 * `s` is `{ x, v }` and is updated in place (and returned).
 */
export function stepSpring(s, target, { hz = 2, ratio = 0.5 } = {}, dt) {
  const a = -stiffnessFor(hz) * (s.x - target) - dampingFor(hz, ratio) * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
  return s;
}

/**
 * A spring you can just `update(target, dt)` every frame, at any frame rate.
 *   const bob = createSpring({ hz: 3, ratio: 0.4 });
 *   mesh.position.y = bob.update(targetY, dt);
 */
export function createSpring({ hz = 2, ratio = 0.5, x = 0, v = 0, substep = 1 / 240 } = {}) {
  const s = { x, v, hz, ratio };
  return Object.assign(s, {
    update(target, dt) {
      fixedSteps(dt, substep, (h) => stepSpring(s, target, s, h));
      return s.x;
    },
    /** Kick the spring: add velocity (e.g. an impact). */
    impulse(dv) { s.v += dv; },
    reset(value = 0) { s.x = value; s.v = 0; },
  });
}
