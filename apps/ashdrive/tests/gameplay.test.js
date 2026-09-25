import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDelta, sweptHit, segmentHit3D, assistedHeading, interceptHeading, selectVisibleTarget } from '../gameplay.js';
import * as THREE from 'three';
import { createMission } from '../missions.js';

test('fast projectiles hit targets crossed between frames', () => {
  assert.equal(sweptHit({ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 0, z: -5 }, 1.6), true);
  assert.equal(sweptHit({ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 2, z: -5 }, 1.6), false);
  assert.equal(sweptHit({ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 0, z: -15 }, 1.6), false);
});

test('stationary and tangent collisions remain finite and inclusive', () => {
  assert.equal(sweptHit({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, 1), true);
  assert.equal(sweptHit({ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 1, z: -5 }, 1), true);
});

test('keyboard aim assist selects aligned targets and respects range and cone', () => {
  const origin = { x: 0, z: 0 };
  assert.equal(assistedHeading(origin, 0, [{ x: 0, z: 20 }]), 0);
  assert.equal(assistedHeading(origin, 0, [{ x: -20, z: -20 }]), 0);
  assert.equal(assistedHeading(origin, 0, [{ x: -1, z: -100 }]), 0);
  assert.ok(assistedHeading(origin, 0, [{ x: -1, z: -20 }]) > 0);
  assert.equal(assistedHeading(origin, 0, [{ x: -1, z: -20 }, { x: 0, z: -40 }]), 0);
});

test('aim wraps smoothly across the -pi/pi boundary', () => {
  assert.ok(Math.abs(angleDelta(-Math.PI + .02, Math.PI - .02) - .04) < 1e-9);
  const heading = assistedHeading({ x: 0, z: 0 }, Math.PI - .02, [{ x: .4, z: 20 }]);
  assert.ok(Math.abs(heading - Math.PI) < .03);
});

test('intercept aim leads moving targets with a finite fallback', () => {
  const origin = { x: 0, z: 0 }, target = { x: 0, z: -20 };
  assert.ok(Math.abs(interceptHeading(origin, target, { x: 0, z: 0 }, 95)) < 1e-9);
  assert.ok(interceptHeading(origin, target, { x: 10, z: 0 }, 95) < 0);
  assert.ok(Number.isFinite(interceptHeading(origin, target, { x: 100, z: 0 }, 95)));
});

function missionFixture() {
  return createMission(THREE, new THREE.Scene(), {
    spawnPoint: { x: 0, y: 12, z: 105 },
    objectives: [
      { x: -75, y: 12, z: -88, label: 'SKYWAY' },
      { x: 80, y: 0, z: -35, label: 'CACHE' },
    ],
  });
}

test('3D projectile sweep hits crossed targets while respecting elevated roads', () => {
  const from = { x: 0, y: 13, z: 0 }, to = { x: 0, y: 13, z: -10 };
  assert.equal(segmentHit3D(from, to, { x: 0, y: 13, z: -5 }, 1.5), true);
  assert.equal(segmentHit3D(from, to, { x: 0, y: 1, z: -5 }, 1.5), false);
  assert.equal(segmentHit3D(from, to, { x: 0, y: 13, z: 5 }, 1.5), false);
  assert.equal(segmentHit3D(from, to, { x: 1.5, y: 13, z: -5 }, 1.5), true);
});

test('3D sweep catches descending rockets and zero-length contact', () => {
  assert.equal(segmentHit3D({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: -10 }, { x: 0, y: 5, z: -5 }, .5), true);
  const point = { x: 10, y: 12, z: 20 };
  assert.equal(segmentHit3D(point, point, point, 1), true);
  assert.equal(segmentHit3D(point, point, { ...point, y: 14 }, 1), false);
});

test('mission requires destruction, physical recovery, and return to extraction', () => {
  const mission = missionFixture();
  mission.update(1 / 60, mission.extraction);
  assert.equal(mission.snapshot().complete, false);
  for (const target of mission.targets) {
    mission.update(1 / 60, target.position);
    assert.equal(target.recovered, false, 'intact relay cannot be recovered');
    assert.equal(mission.hit(target, 5), false);
    assert.equal(mission.hit(target, 1), true);
    assert.equal(mission.hit(target, 99), false, 'destruction is awarded once');
    assert.equal(target.recovered, false, 'damage itself does not recover data');
    mission.update(1 / 60, target.position);
    assert.equal(target.recovered, true);
  }
  assert.equal(mission.snapshot().phase, 'extract');
  assert.equal(mission.snapshot().complete, false);
  mission.update(1 / 60, mission.extraction);
  assert.equal(mission.snapshot().complete, true);
});

test('elevated mission caches cannot be recovered from underneath the road', () => {
  const mission = missionFixture(), target = mission.targets[0];
  mission.hit(target, 7);
  mission.update(1 / 60, new THREE.Vector3(target.position.x, 0, target.position.z));
  assert.equal(target.recovered, false);
  mission.update(1 / 60, new THREE.Vector3(target.position.x, 12, target.position.z));
  assert.equal(target.recovered, true);
});

test('mission reset restores destroyed targets and clears recovered data', () => {
  const mission = missionFixture();
  for (const target of mission.targets) {
    mission.hit(target, 7); mission.update(1 / 60, target.position);
  }
  mission.update(1 / 60, mission.extraction);
  mission.reset();
  const state = mission.snapshot();
  assert.equal(state.complete, false);
  assert.equal(state.destroyed, 0);
  assert.equal(state.recovered, 0);
  for (const target of mission.targets) {
    assert.equal(target.health, target.maxHealth);
    assert.equal(target.equipment.visible, true);
    assert.equal(target.intel.visible, false);
  }
});

test('mission rejects invalid damage without corrupting health', () => {
  const mission = missionFixture(), target = mission.targets[0];
  for (const damage of [NaN, Infinity, -1, 0]) assert.equal(mission.hit(target, damage), false);
  assert.equal(target.health, 6);
  assert.equal(mission.hit({ health: 6 }, 10), false);
});

const lockOrigin = { x: 0, y: 1.35, z: 0 };
const lockTarget = (x, z, extra = {}) => ({ health: 3, position: { x, y: 1.35, z }, ...extra });

test('weapon lock skips covered targets and chooses the nearest visible target across enemies and relays', () => {
  const hiddenDrone = lockTarget(0, -8), visibleDrone = lockTarget(0, -30), visibleRelay = lockTarget(0, -20);
  const groups = [[hiddenDrone, visibleDrone], [visibleRelay]];
  const selected = selectVisibleTarget(lockOrigin, 0, groups, { maxAngle: .95, isBlocked: (_from, _to, target) => target === hiddenDrone });
  assert.equal(selected.target, visibleRelay);
  assert.equal(selected.distance, 20);
  assert.ok(Math.abs(selected.angle) < 1e-9);
  assert.equal(groups[0][0], hiddenDrone, 'selection leaves caller ordering untouched');
});

test('lock acquisition respects aim cone, full 3D range, and wrapped headings', () => {
  const behind = lockTarget(0, 10), side = lockTarget(-10, -10), high = lockTarget(0, -10, { position: { x: 0, y: 101.35, z: -10 } });
  assert.equal(selectVisibleTarget(lockOrigin, 0, [[behind, side, high]], { maxAngle: .2, maxRange: 50 }), null);
  const wrapped = lockTarget(.1, 10);
  assert.equal(selectVisibleTarget(lockOrigin, Math.PI - .02, [[wrapped]], { maxAngle: .1 }).target, wrapped);
  const boundary = lockTarget(0, -50);
  assert.equal(selectVisibleTarget(lockOrigin, 0, [[boundary]], { maxRange: 50 }).target, boundary);
});

test('destroyed, recovered, invisible, and invalid candidates cannot steal a lock', () => {
  const valid = { health: 6, mesh: { visible: true, position: { x: 0, y: 1.35, z: -40 } } };
  const inactive = [
    lockTarget(0, -2, { health: 0 }), lockTarget(0, -3, { destroyed: true }),
    lockTarget(0, -4, { recovered: true }), lockTarget(0, -5, { visible: false }),
    { health: 3, mesh: { visible: false, position: { x: 0, y: 1.35, z: -6 } } },
    lockTarget(NaN, -7), lockTarget(0, 0), { health: 3 },
  ];
  assert.equal(selectVisibleTarget(lockOrigin, 0, [inactive, [valid]]).target, valid);
});

test('occlusion query uses muzzle origin and runs only for candidates that could win', () => {
  const behind = lockTarget(0, 2), far = lockTarget(0, -230), near = lockTarget(0, -10), farther = lockTarget(0, -20);
  const calls = [];
  const selection = selectVisibleTarget(lockOrigin, 0, [[behind, far, near, farther]], {
    maxAngle: .95,
    isBlocked: (from, to, target) => { calls.push(target); assert.equal(from, lockOrigin); assert.equal(to, target.position); return false; },
  });
  assert.equal(selection.target, near);
  assert.deepEqual(calls, [near]);
});

test('all obstructed targets produce no lock and ties retain stable caller order', () => {
  const first = lockTarget(0, -20), second = lockTarget(0, -20);
  assert.equal(selectVisibleTarget(lockOrigin, 0, [[first], [second]], { isBlocked: () => true }), null);
  assert.equal(selectVisibleTarget(lockOrigin, 0, [[first], [second]]).target, first);
  assert.equal(selectVisibleTarget(lockOrigin, 0, [[], []]), null);
});
