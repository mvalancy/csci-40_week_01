// Small, dependency-free math helpers shared by every app.
// Plain numbers in, plain numbers out, so they run in the browser, in
// workers and in `node --test` alike.

export const TAU = Math.PI * 2;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Where `v` sits between a and b (0 at a, 1 at b). Not clamped. */
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
/** Map `v` from [a0, a1] onto [b0, b1]. Not clamped. */
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, v));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};

/**
 * Frame-rate independent exponential smoothing toward `target`.
 * `rate` is how many "e-foldings" happen per second (bigger = snappier).
 */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

/** Move `current` toward `target` by at most `maxDelta`, never overshooting. */
export const approach = (current, target, maxDelta) =>
  current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);

/** Wrap an angle into (-π, π]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Shortest signed turn from angle `from` to angle `to`. */
export const angleDelta = (from, to) => wrapAngle(to - from);
/** `damp` for angles: takes the short way around. */
export const dampAngle = (current, target, rate, dt) => current + angleDelta(current, target) * (1 - Math.exp(-rate * dt));

/**
 * Run `step(h)` in fixed slices covering `dt`, so stiff simulations stay
 * stable at any frame rate. `dt` is clamped to `maxDt` first (a stalled tab
 * shouldn't fast-forward physics by seconds). Returns the number of slices.
 */
export function fixedSteps(dt, h, step, maxDt = 0.1) {
  const total = clamp(dt, 0, maxDt);
  const n = Math.min(64, Math.ceil(total / h - 1e-9));
  const slice = n ? total / n : 0;
  for (let i = 0; i < n; i++) step(slice);
  return n;
}
