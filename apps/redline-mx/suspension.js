// Per-rider suspension: the shared two-wheel model (shared/lib/suspension.js)
// fed by this game's physics, posing the bike from bikes.js.
//
// The Rider in rider.js stays a point on the ground; this only moves the body
// (heave + pitch) and the wheels relative to it, so gameplay is unchanged.
import * as THREE from 'three';
import { clamp } from '../../shared/lib/math.js';
import { createBikeSuspension, SUSPENSION_PRESETS as P } from '../../shared/lib/suspension.js';
import { createSuspensionRig } from '../../shared/lib/three/rig.js';
import { WHEELBASE } from './bikes.js';

// Each model gets suspension that matches its look.
const TUNING = {
  dirt: { front: P.motocross, rear: { ...P.motocross, hz: 1.9 } }, // long travel, plush
  chopper: { front: P.cruiser, rear: { ...P.cruiser, travel: 0.07 } }, // short, stiff, hardtail-ish rear
  sport: { front: P.street, rear: P.street },
  hover: { front: P.hover, rear: P.hover }, // floaty grav-rings
  mech: { front: P.heavy, rear: P.heavy },
  retro: { front: { travel: 0.16, sag: 0.3, hz: 2, compression: 0.28, rebound: 0.5 }, rear: { travel: 0.14, sag: 0.3, hz: 2.1, compression: 0.3, rebound: 0.55 } },
};

const HALF = WHEELBASE / 2;

export function createRiderSuspension(rider, bike, track) {
  const tune = TUNING[bike.model] || TUNING.dirt;
  const susp = createBikeSuspension({ wheelbase: WHEELBASE, front: tune.front, rear: tune.rear });
  // Fork direction: along the first front link (fork leg), else straight up.
  const fork = bike.links.find((l) => l.end === 'front');
  const axis = fork ? fork.anchor.clone().sub(bike.front.position).setZ(0) : undefined;
  const rig = createSuspensionRig(THREE, { front: { wheel: bike.front, axis }, rear: { wheel: bike.rear }, links: bike.links });
  let prevSpeed = rider.speed;

  // Ground under a wheel relative to the line the bike is riding on (+ = bump).
  const bumpAt = (dx) => {
    const a = track.slope(rider.x);
    return clamp(track.height(rider.x + dx * Math.cos(a)) - (rider.y + dx * Math.sin(a)), -0.35, 0.35);
  };

  return {
    susp,
    /** Fixed-step update, right after rider.update(). Returns bottom-out events. */
    step(dt) {
      const accel = clamp((rider.speed - prevSpeed) / dt, -60, 60);
      prevSpeed = rider.speed;
      const down = !rider.airborne && !rider.crashed;
      return susp.step(dt, {
        grounded: { front: down && rider.wheelie < 0.05, rear: down },
        front: down ? bumpAt(HALF) : 0,
        rear: down ? bumpAt(-HALF) : 0,
        accel: down ? accel : 0,
      });
    },
    onEvent(e) {
      if (e.type === 'jump') susp.resetPeaks();
      else if (e.type === 'land') susp.land(e.impact ?? 0, e.noseDown ?? 0);
      else if (e.type === 'respawn') susp.reset();
    },
    /** Per render frame: pose body and wheels. */
    pose() {
      bike.body.position.y = susp.heave;
      bike.body.rotation.z = susp.pitch;
      rig.apply({ front: susp.wheelOffset('front'), rear: susp.wheelOffset('rear') });
    },
  };
}
