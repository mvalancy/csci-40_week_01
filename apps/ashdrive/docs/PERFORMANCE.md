# Performance architecture

ASHDRIVE keeps gameplay timing independent of rendering speed. Physics, weapons, damage, and mission progress run at a fixed 60 Hz. Camera movement, scenery animation, effects, and audio presentation update once per rendered frame. Frame deltas are bounded to prevent long interruptions from producing unstable simulation steps. Cosmetic camera randomness does not consume the gameplay random-number sequence.

## Geometry and collision

Static world and mission components are batched by material while preserving geometry and independently animated parts. Mission machinery dropped from 102 meshes to 45 without changing its 1,812 triangles. Radar dishes, equipment visibility, intel animation, and individual indicators retain their own state. Traffic and refinery smoke use instancing. Additive fire billboards share a draw; transparent explosion smoke retains individual sprites for sorting.

Cover queries use an axis-aligned bounding-box rejection followed by scalar slab intersection. Road-plane coefficients are precomputed. This avoids allocating arrays for every collider on every projectile update. Swept sphere tests return the earliest impact fraction, allowing targets and cover to compete by actual distance along a projectile's path.

## Rendering and quality

Bloom pipelines are created only when a selected quality tier needs them. Shadow render targets remain owned by Three.js across quality changes; manually disposing cached WebGPU shadow textures can invalidate live bindings.

Pause freezes simulation and presentation animation, and renders only when a change requires it, such as resizing. Hidden documents skip frame work and clear accumulated simulation time. Returning to the page leaves gameplay paused.

Auto quality uses sustained frame timings and hysteresis rather than reacting to single stalls. At its lowest tier, fresh GPU measurements distinguish expensive GPU work from CPU or compositor contention. Cheap GPU frames prevent unnecessary emergency resolution reductions; sustained measured headroom can restore clarity gradually. Unsupported or stale timing falls back to frame-rate feedback. Manual quality selections remain fixed.

GPU timing is asynchronous and bounded: no blocking waits, synchronization, or pixel readbacks. WebGL query results are read only after availability and rejected during disjoint events. Native samples require matching renderer-frame identity, preventing cached durations from masquerading as new measurements. Sample age limits their use in quality decisions. A session started at manual quality enables native timestamp tracking on demand when switched to Auto.

## Validation

Run the Node suites in `tests/*.test.js`. They cover quality hysteresis and GPU feedback, timer lifecycle and freshness, swept collisions, road physics, navigation, mission state, and batching invariants.

Headed lab checks additionally exercise native and fallback rendering, quality transitions, pause/focus behavior, full autonomous missions, and visual appearance. The lab QA README records that workflow; those development helpers are separate from the standalone public build. Microbenchmarks measure isolated work and must not be presented as game FPS improvements.
