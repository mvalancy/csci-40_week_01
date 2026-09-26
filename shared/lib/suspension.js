// Two-wheel bike suspension: a front and a rear "quarter car", each a sprung
// body end sitting on a spring-damper over its wheel.
//
// The game keeps doing its own physics for the bike as a whole (a "frame"
// that follows the ground or flies). This module adds the part that sells it:
// the body squatting, diving, soaking up landings and bottoming out, while
// the wheels track the ground. Everything is relative to that frame:
//
//   body offset   how far the sprung body end has moved from its normal ride height (+ up)
//   wheel offset  how far the wheel has moved up into the body (+ = compressed, relative to sag)
//
// Per-end model (per unit mass, like shared/lib/spring.js):
//   compression c = sag + (wheel - body), limited to [0, travel]
//   body accel    = k (c - sag) + damping · c'  + weight transfer
// with separate compression / rebound damping, a progressive bump stop in the
// last 20% of travel, and hard stops at both ends (bottom-out / top-out).
import { clamp, fixedSteps } from './math.js';
import { stiffnessFor, dampingFor } from './spring.js';

/** Starting points. travel in metres; sag = fraction of travel used at rest. */
export const SUSPENSION_PRESETS = {
  motocross: { travel: 0.3, sag: 0.33, hz: 1.8, compression: 0.3, rebound: 0.6 },
  street: { travel: 0.13, sag: 0.3, hz: 2.6, compression: 0.35, rebound: 0.65 },
  cruiser: { travel: 0.1, sag: 0.3, hz: 2.3, compression: 0.3, rebound: 0.55 },
  hover: { travel: 0.34, sag: 0.4, hz: 1.2, compression: 0.18, rebound: 0.32 },
  heavy: { travel: 0.22, sag: 0.35, hz: 1.5, compression: 0.45, rebound: 0.75 },
  armored: { travel: 0.26, sag: 0.3, hz: 1.7, compression: 0.38, rebound: 0.62 },
};

const SUBSTEP = 1 / 240;
const BUMP_START = 0.8; // bump stop engages over the last 20% of travel
const BUMP_GAIN = 12; // bump stop stiffness multiplier at full travel
const DROOP_RATE = 30; // how fast an unloaded wheel drops to full extension (1/s)
const AIR_RELAX_HZ = 2.5; // body settling back onto the frame while airborne
const MAX_WHEEL_SPEED = 6; // m/s: ground steps / pose kinks are followed this fast, never teleported

function createEnd(settings) {
  const cfg = { ...SUSPENSION_PRESETS.motocross, ...settings };
  const sagM = cfg.sag * cfg.travel;
  return {
    cfg,
    sag: sagM,
    body: 0, // body offset (m, + up)
    bodyV: 0,
    wheel: 0, // wheel height relative to the frame's contact line (m)
    wheelV: 0,
    ground: 0, // latest ground input (m)
    contact: true, // wheel touching the ground
    compression: sagM, // m, 0 = fully extended, travel = bottomed
    peak: sagM, // deepest compression since the last snapshot read
  };
}

function stepEnd(e, h, groundTarget, grounded, extraAccel, events, name) {
  const { travel, hz, compression, rebound } = e.cfg;
  const k = stiffnessFor(hz);

  // The wheel touches the ground only if the ground is within reach of the
  // fully extended suspension. Otherwise (in the air, or the ground falling
  // away over a crest) it hangs at full extension and pushes on nothing.
  const prevWheel = e.wheel;
  const hang = e.body - e.sag;
  const contact = grounded && groundTarget >= hang;
  if (contact) e.wheel += clamp(groundTarget - e.wheel, -MAX_WHEEL_SPEED * h, MAX_WHEEL_SPEED * h);
  else e.wheel += (hang - e.wheel) * clamp(DROOP_RATE * h, 0, 1);
  e.wheelV = (e.wheel - prevWheel) / h;

  let c = e.sag + e.wheel - e.body;
  const cV = e.wheelV - e.bodyV;
  let a;
  if (contact) {
    const ratio = cV > 0 ? compression : rebound;
    a = k * (c - e.sag) + dampingFor(hz, ratio) * cV + extraAccel;
    const bump = c - travel * BUMP_START;
    if (bump > 0) a += k * BUMP_GAIN * (bump * bump) / (travel * (1 - BUMP_START));
  } else {
    // Nothing pushes on the body: it settles back to its ride height.
    a = -stiffnessFor(AIR_RELAX_HZ) * e.body - dampingFor(AIR_RELAX_HZ, 1) * e.bodyV;
  }
  e.bodyV += a * h;
  e.body += e.bodyV * h;

  // Hard stops. Bottom-out: a planted wheel can't go further into the body, so
  // the body stops. Top-out, or any stop while hanging: the light wheel moves.
  c = e.sag + e.wheel - e.body;
  if (c > travel && contact) {
    const speed = e.wheelV - e.bodyV;
    e.body = e.wheel + e.sag - travel;
    if (speed > 0) {
      e.bodyV = e.wheelV;
      if (speed > 0.4) events.push({ type: 'bottomOut', end: name, speed });
    }
    c = travel;
  } else if (c < 0 || c > travel) {
    c = clamp(c, 0, travel);
    e.wheel = e.body - e.sag + c;
    e.wheelV = e.bodyV;
  }
  e.compression = c;
  e.contact = contact;
  e.peak = Math.max(e.peak, c);
}

/**
 *   const susp = createBikeSuspension({ wheelbase: 1.9, front: SUSPENSION_PRESETS.motocross });
 *   // every frame, after your own bike physics:
 *   const events = susp.step(dt, { grounded, front: bumpUnderFront, rear: bumpUnderRear, accel });
 *   susp.land(verticalSpeed, noseDown);   // on touchdown, before step()
 *   body.position.y = susp.heave; body.rotation.z = susp.pitch; // nose-up positive
 *
 * step() inputs:
 *   grounded       boolean, or { front, rear } (e.g. a wheelie: front false)
 *   front / rear   ground height under that wheel relative to the frame's contact line (m).
 *                  0 on smooth ground; positive over a bump or the lip of a ramp.
 *   accel          forward acceleration of the frame (m/s²): + squats the rear, - dives the front
 * Returns events: [{ type: 'bottomOut', end: 'front' | 'rear', speed }].
 */
export function createBikeSuspension({ wheelbase = 1.9, front = {}, rear = front, transfer = 0.35 } = {}) {
  const ends = { front: createEnd(front), rear: createEnd(rear) };
  const last = { front: 0, rear: 0 };
  const api = {
    wheelbase,
    front: ends.front,
    rear: ends.rear,
    /** Body height offset at the middle of the wheelbase (m, + up). */
    heave: 0,
    /** Body pitch offset (radians, nose up positive). */
    pitch: 0,

    step(dt, { grounded = true, front: gF = 0, rear: gR = 0, accel = 0 } = {}) {
      const events = [];
      const onF = typeof grounded === 'object' ? !!grounded.front : !!grounded;
      const onR = typeof grounded === 'object' ? !!grounded.rear : !!grounded;
      const startF = last.front, startR = last.rear;
      const total = clamp(dt, 0, 0.1);
      let t = 0;
      // Ground inputs are interpolated across the substeps so a sudden bump
      // reads as a fast wheel movement, not a teleport.
      fixedSteps(total, SUBSTEP, (h) => {
        t += h;
        const f = total ? t / total : 1;
        stepEnd(ends.front, h, startF + (gF - startF) * f, onF, accel * transfer, events, 'front');
        stepEnd(ends.rear, h, startR + (gR - startR) * f, onR, -accel * transfer, events, 'rear');
      });
      last.front = gF;
      last.rear = gR;
      api.heave = (ends.front.body + ends.rear.body) / 2;
      api.pitch = Math.atan2(ends.front.body - ends.rear.body, wheelbase);
      return events;
    },

    /**
     * Touchdown: the body keeps falling at `speed` (m/s, positive = downward)
     * after the wheels stop. `noseDown` (radians) shifts the hit to the front.
     */
    land(speed, noseDown = 0) {
      const v = Math.max(0, speed);
      const bias = clamp(noseDown * 1.5, -0.6, 0.6);
      ends.front.bodyV -= v * (1 + bias);
      ends.rear.bodyV -= v * (1 - bias);
    },

    /** Add vertical velocity to one end (m/s, + up): kerbs, hits, explosions. */
    kick(end, dv) { ends[end].bodyV += dv; },

    /** Wheel travel relative to the body for posing wheels (m, + = compressed past sag). */
    wheelOffset(end) { return ends[end].compression - ends[end].sag; },

    reset() {
      for (const name of ['front', 'rear']) {
        const e = ends[name];
        Object.assign(e, { body: 0, bodyV: 0, wheel: 0, wheelV: 0, compression: e.sag, peak: e.sag, contact: true });
        last[name] = 0;
      }
      api.heave = api.pitch = 0;
    },

    /** Start measuring peak compression afresh (e.g. at takeoff). */
    resetPeaks() { for (const e of Object.values(ends)) e.peak = e.compression; },

    /** Plain data for tests / HUDs. Compression and peak are 0..1 of travel. */
    snapshot() {
      const out = { heave: api.heave, pitch: api.pitch };
      for (const name of ['front', 'rear']) {
        const e = ends[name];
        out[name] = { compression: e.compression / e.cfg.travel, peak: e.peak / e.cfg.travel, body: e.body, contact: !!e.contact };
      }
      return out;
    },
  };
  return api;
}
