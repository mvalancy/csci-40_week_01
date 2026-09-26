# shared/lib: code every demo can use

Small, tested building blocks shared by all apps in this repo. Import them
with a relative path from your app:

```js
import { clamp, damp } from '../../shared/lib/math.js';
import { createBikeSuspension, SUSPENSION_PRESETS } from '../../shared/lib/suspension.js';
import { createSuspensionRig } from '../../shared/lib/three/rig.js';
```

Standalone builds (`apps/<slug>/standalone.vite.config.js`) bundle these files
too, and the Cloudflare projects rebuild when `shared/lib/` changes.

| module | what it gives you |
|---|---|
| `math.js` | `clamp`, `lerp`, `invLerp`, `remap`, `smoothstep`, frame-rate independent `damp`, `approach`, `wrapAngle`, `angleDelta`, `dampAngle`, `fixedSteps` (run a simulation in fixed slices at any frame rate) |
| `spring.js` | springs set by natural frequency (Hz) and damping ratio: `createSpring()` for "follow this value with some bounce", `stepSpring`, `stiffnessFor`, `dampingFor` |
| `suspension.js` | two-wheel vehicle suspension: `createBikeSuspension()` with front/rear spring-dampers, separate compression and rebound damping, progressive bump stops, top-out, landings, throttle squat and brake dive. `SUSPENSION_PRESETS` has motocross, street, cruiser, hover, heavy and armored |
| `three/rig.js` | three.js posing: `stretchBetween()` spans a unit mesh between two points; `createSuspensionRig()` slides wheels along their fork axis and keeps fork legs and swingarms attached |

## Rules

- **No three.js import in the core files.** `math`, `spring` and `suspension` are plain JS, so
  they run anywhere, including `node --test`. Anything that needs three.js lives in `three/`
  and takes `THREE` as a parameter.
- **Backwards compatible.** Other apps depend on these files. Add options with defaults;
  don't change what existing calls do.
- **Tested.** Add or update a test in `tests/` for every change: `npm run test:lib`.

## Who uses what

| app | uses |
|---|---|
| REDLINE MX | `suspension.js`, `three/rig.js`, `math.js` via `apps/redline-mx/suspension.js` (per-bike tuning) |
| ASHDRIVE | `suspension.js`, `three/rig.js`, `math.js` via `apps/ashdrive/suspension.js` |

## Adding a suspension to a new vehicle

1. Keep your own physics for the vehicle as a whole: a frame that follows the ground or flies.
2. Every frame, call `susp.step(dt, { grounded, front, rear, accel })`, where `front` and `rear`
   are the ground height under each wheel relative to the frame (0 on smooth ground).
   On touchdown, call `susp.land(verticalSpeed)` first.
3. Put everything visible in a `body` group under the frame. Set
   `body.position.y = susp.heave` and the body's pitch to `susp.pitch` (nose up is positive).
4. Call `rig.apply({ front: susp.wheelOffset('front'), rear: susp.wheelOffset('rear') })`.
   Build fork legs and swingarms as unit-height meshes (height 1 along Y) and pass them as
   `links`, so they stretch to follow the wheels.
