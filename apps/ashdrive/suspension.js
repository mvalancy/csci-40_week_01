// Suspension for the AD-07: the shared two-wheel model (shared/lib/suspension.js)
// fed by ASHDRIVE's ground physics, posing the sprung body from bike.js.
// Gameplay physics (physics.js) is untouched; this is the ride on top of it.
import * as THREE from 'three';
import { clamp, damp } from '../../shared/lib/math.js';
import { createBikeSuspension, SUSPENSION_PRESETS } from '../../shared/lib/suspension.js';
import { createSuspensionRig } from '../../shared/lib/three/rig.js';

export function createBikeRide(bike, world) {
  const { body, front, rear, links, wheelbase } = bike.userData;
  const susp = createBikeSuspension({
    wheelbase,
    front: SUSPENSION_PRESETS.armored,
    rear: { ...SUSPENSION_PRESETS.armored, hz: 1.8 },
    transfer: 0.15, // the turbine spins up hard; keep squat/dive readable, not a wheelie
  });
  // Front wheel slides up the raked fork; the rear rides its swingarm.
  const fork = links.find((l) => l.end === 'front');
  const axis = fork ? fork.anchor.clone().sub(fork.from).setX(0) : undefined;
  const rig = createSuspensionRig(THREE, { front: { wheel: front, axis }, rear: { wheel: rear }, links });
  const halfFront = -front.position.z, halfRear = rear.position.z;
  let pitch = 0, prevSpeed = 0;

  return {
    susp,
    reset() { susp.reset(); pitch = 0; prevSpeed = 0; },
    /**
     * After the vertical step. `speed` is forward speed (m/s), `vertical` is
     * physics.js's result. Poses the bike frame (yaw, terrain pitch, roll) and
     * the sprung body. Returns bottom-out events.
     */
    update(dt, { heading, speed, roll, vertical }) {
      const { x, z } = bike.position, y = vertical.y;
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const hFront = world.heightAt(x + fx * halfFront, z + fz * halfFront, y);
      const hRear = world.heightAt(x - fx * halfRear, z - fz * halfRear, y);
      // Frame pitch: along the ground under both wheels, or following the flight path.
      const target = vertical.grounded ? Math.atan2(hFront - hRear, wheelbase) : clamp(vertical.vy * 0.025, -0.3, 0.3);
      pitch = damp(pitch, clamp(target, -0.45, 0.45), vertical.grounded ? 10 : 3, dt);
      bike.rotation.set(pitch, heading, roll, 'YXZ');

      if (vertical.landed) susp.land(vertical.impact * 0.6);
      const accel = clamp((speed - prevSpeed) / Math.max(dt, 1e-4), -60, 60);
      prevSpeed = speed;
      // Terrain under each wheel relative to the pitched frame (+ = bump / kerb).
      const s = Math.sin(pitch);
      const events = susp.step(dt, {
        grounded: vertical.grounded,
        front: clamp(hFront - (y + halfFront * s), -0.4, 0.4),
        rear: clamp(hRear - (y - halfRear * s), -0.4, 0.4),
        accel: vertical.grounded ? accel : 0,
      });
      body.position.y = susp.heave;
      body.rotation.x = susp.pitch;
      rig.apply({ front: susp.wheelOffset('front'), rear: susp.wheelOffset('rear') });
      return events;
    },
  };
}
