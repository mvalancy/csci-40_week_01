// node --test shared/lib/tests  (or: npm run test:lib)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, damp, wrapAngle, angleDelta, approach, fixedSteps, remap, smoothstep } from '../math.js';
import { createSpring } from '../spring.js';
import { createBikeSuspension, SUSPENSION_PRESETS } from '../suspension.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b} (±${eps})`);

test('math basics', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  near(remap(5, 0, 10, 100, 200), 150);
  near(smoothstep(0, 1, 0.5), 0.5);
  near(wrapAngle(3 * Math.PI), Math.PI);
  near(angleDelta(Math.PI - 0.1, -Math.PI + 0.1), 0.2);
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(9, 10, 3), 10);
});

test('damp is frame-rate independent', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
  for (let i = 0; i < 20; i++) b = damp(b, 1, 5, 1 / 20);
  near(a, b, 1e-9);
});

test('fixedSteps slices dt and clamps stalls', () => {
  let sum = 0;
  assert.equal(fixedSteps(1 / 60, 1 / 240, (h) => (sum += h)), 4);
  near(sum, 1 / 60);
  sum = 0;
  fixedSteps(5, 1 / 240, (h) => (sum += h));
  near(sum, 0.1); // a 5 s stall only simulates 0.1 s
});

test('spring settles on its target at any frame rate', () => {
  for (const fps of [30, 60, 144]) {
    const s = createSpring({ hz: 3, ratio: 0.7 });
    for (let i = 0; i < fps * 3; i++) s.update(1, 1 / fps);
    near(s.x, 1, 1e-3);
  }
});

const run = (susp, seconds, input, fps = 60) => {
  const events = [];
  for (let i = 0; i < seconds * fps; i++) events.push(...susp.step(1 / fps, typeof input === 'function' ? input(i / fps) : input));
  return events;
};

test('suspension rests at sag on flat ground', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
  run(s, 2, { grounded: true });
  const snap = s.snapshot();
  near(snap.front.compression, SUSPENSION_PRESETS.motocross.sag, 1e-6);
  near(s.heave, 0, 1e-6);
  near(s.pitch, 0, 1e-6);
});

test('a hard landing compresses, bottoms out, then recovers', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
  run(s, 0.5, { grounded: false });
  assert.ok(s.snapshot().front.compression < 0.05, 'wheels droop in the air');
  s.land(9);
  const events = run(s, 0.4, { grounded: true });
  const snap = s.snapshot();
  assert.equal(snap.front.peak, 1, 'hit the bump stop');
  assert.ok(events.some((e) => e.type === 'bottomOut'), 'bottom-out event fired');
  run(s, 2, { grounded: true });
  near(s.snapshot().front.compression, SUSPENSION_PRESETS.motocross.sag, 1e-3);
});

test('a soft landing is absorbed without bottoming out', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
  s.land(1.5);
  const events = run(s, 0.6, { grounded: true });
  const peak = s.snapshot().front.peak;
  assert.ok(peak > 0.4 && peak < 1, `peak ${peak}`);
  assert.equal(events.length, 0);
});

test('throttle squats the rear, braking dives the front', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.street });
  run(s, 1, { accel: 20 });
  assert.ok(s.pitch > 0.005, `nose lifts under throttle (${s.pitch})`);
  run(s, 1, { accel: -25 });
  assert.ok(s.pitch < -0.005, `nose dives under braking (${s.pitch})`);
});

test('a bump under the front wheel compresses the fork first', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
  run(s, 0.5, { grounded: true });
  s.resetPeaks();
  s.step(1 / 60, { grounded: true, front: 0.12, rear: 0 });
  const snap = s.snapshot();
  assert.ok(snap.front.compression > snap.rear.compression + 0.2, JSON.stringify(snap));
});

test('stiffer presets move less for the same hit', () => {
  const soft = createBikeSuspension({ front: SUSPENSION_PRESETS.hover });
  const stiff = createBikeSuspension({ front: SUSPENSION_PRESETS.street });
  soft.land(1); stiff.land(1);
  run(soft, 0.5, { grounded: true }); run(stiff, 0.5, { grounded: true });
  const peakSoft = soft.snapshot().front.peak * SUSPENSION_PRESETS.hover.travel;
  const peakStiff = stiff.snapshot().front.peak * SUSPENSION_PRESETS.street.travel;
  assert.ok(peakSoft > peakStiff, `${peakSoft} > ${peakStiff}`);
});

test('results do not depend on frame rate', () => {
  const peaks = [30, 60, 144].map((fps) => {
    const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
    s.land(3);
    run(s, 0.5, { grounded: true }, fps);
    return s.snapshot().front.peak;
  });
  near(peaks[0], peaks[2], 0.03);
});

test('in the air the body settles back to ride height (wheels just droop)', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
  s.land(6);
  run(s, 0.1, { grounded: true });
  run(s, 1, { grounded: false }); // take off mid-compression
  near(s.heave, 0, 0.01);
  near(s.pitch, 0, 0.01);
  assert.ok(s.snapshot().front.compression < 0.02, 'fully extended');
});

test('ground dropping away over a crest lets the wheel leave it, not pull the body down', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.motocross });
  run(s, 0.5, { grounded: true });
  run(s, 0.5, { grounded: true, front: -0.5 }); // a drop far deeper than the fork can reach
  assert.ok(s.front.body > -0.05, `front body stayed up (${s.front.body})`);
  assert.equal(s.snapshot().front.contact, false);
});

test('a sudden step in the ground is ridden over, not teleported through', () => {
  const s = createBikeSuspension({ front: SUSPENSION_PRESETS.street });
  run(s, 0.5, { grounded: true });
  s.step(1 / 120, { grounded: true, front: 0.5, rear: 0.5 }); // a half-metre kerb in one tick
  assert.ok(Math.abs(s.front.bodyV) < 8, `body not launched (${s.front.bodyV} m/s)`);
  run(s, 2, { grounded: true, front: 0.5, rear: 0.5 });
  near(s.front.body, 0.5, 0.01); // settled on top of the step
});
