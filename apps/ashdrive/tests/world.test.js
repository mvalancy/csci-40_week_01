import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../world.js';

// Geometry/physics queries need no GPU. Canvas commands only create visual art,
// so a tiny inert context lets the real world module run in Node unchanged.
const noop = () => {};
const context = new Proxy({}, {
  get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
    ? () => ({ addColorStop: noop }) : noop,
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => context }) };
const world = createWorld(THREE, new THREE.Scene());

function driveRoad(axis, start, end, speed) {
  const direction = Math.sign(end - start), dt = 1 / 60;
  const sample = n => axis === 'z' ? { x: 0, z: n } : { x: n, z: -88 };
  let n = start, height = world.heightAt(...Object.values(sample(n)));
  const samples = [];
  while (Math.abs(n - end) > .000001) {
    n = direction > 0 ? Math.min(end, n + speed * dt) : Math.max(end, n - speed * dt);
    const { x, z } = sample(n), nextHeight = world.heightAt(x, z, height);
    assert.ok(Math.abs(nextHeight - height) <= speed * dt * .15 + .000001, `Discontinuous road at ${axis}=${n}: ${height} -> ${nextHeight}`);
    const position = { x, y: nextHeight, z };
    assert.equal(world.pushOut(position, 1.1), false, `Road lane blocked at ${axis}=${n}`);
    samples.push({ n, height: nextHeight }); height = nextHeight;
  }
  return samples;
}

test('a bike can drive both entire freeways up and down at cruise and boost speeds', () => {
  for (const axis of ['x', 'z']) for (const speed of [30, 53]) for (const direction of [-1, 1]) {
    const samples = driveRoad(axis, -205 * direction, 205 * direction, speed);
    assert.equal(samples.at(-1).height, 0);
    assert.equal(Math.max(...samples.map(s => s.height)), 12);
    assert.ok(samples.some(s => s.height > 5 && s.height < 7));
  }
});

test('ground traffic passes beneath decks while traffic on top keeps its elevation', () => {
  for (let x = -7; x <= 7; x += .5) {
    assert.equal(world.heightAt(x, 30, 0), 0);
    assert.equal(world.heightAt(x, 30, 12), 12);
    assert.equal(world.pushOut({ x, y: 0, z: 30 }, 1.1), false);
  }
  assert.equal(world.heightAt(14.01, 30, 12), 0, 'Leaving the deck exposes ground for falling physics');
});

test('all spawn and mission locations are supported and clear of props', () => {
  for (const site of [world.spawnPoint, ...world.objectives]) {
    assert.equal(world.heightAt(site.x, site.z), site.y, site.label);
    for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) {
      assert.equal(world.pushOut({ x: site.x + dx, y: site.y, z: site.z + dz }, 1.1), false, site.label);
    }
  }
});

test('cargo collisions resolve from centers and corners without trapping the bike', () => {
  for (const position of [{ x: -48, y: 0, z: 40 }, { x: -44.5, y: 0, z: 47 }]) {
    assert.equal(world.pushOut(position, 1.1), true);
    assert.equal(world.pushOut(position, 1.1), false, 'Resolved point must remain outside');
  }
  assert.equal(world.pushOut({ x: -48, y: 8, z: 40 }, 1.1), false, 'Airborne bike clears container roof');
});

test('freeway piers block ground traffic without blocking the road above', () => {
  const position = { x: 11, y: 0, z: 0 };
  assert.equal(world.pushOut(position, 1.1), true);
  assert.equal(world.pushOut(position, 1.1), false);
  assert.equal(world.pushOut({ x: 11, y: 12, z: 0 }, 1.1), false);
});

test('projectiles hit cargo, thin piers, ramps and ground but pass clear air', () => {
  assert.equal(world.segmentBlocked({x:-60,y:2,z:40}, {x:-35,y:2,z:40}), true);
  assert.equal(world.segmentBlocked({x:11,y:2,z:-3}, {x:11,y:2,z:3}), true);
  assert.equal(world.segmentBlocked({x:0,y:15,z:20}, {x:0,y:8,z:20}), true);
  assert.equal(world.segmentBlocked({x:0,y:5,z:180}, {x:0,y:5,z:145}), true);
  assert.equal(world.segmentBlocked({x:80,y:2,z:0}, {x:80,y:-2,z:0}), true);
  assert.equal(world.segmentBlocked({x:0,y:14,z:90}, {x:0,y:14,z:20}), false);
  assert.equal(world.segmentBlocked({x:0,y:2,z:25}, {x:0,y:2,z:50}), false);
  const hit = world.segmentHit({x:-60,y:2,z:40}, {x:-35,y:2,z:40});
  assert.equal(hit.x, -51, 'Impact is on nearest container face');
  assert.equal(hit.y, 2);
  assert.equal(world.segmentBlocked({x:-48,y:2,z:40}, {x:-47,y:2,z:40}), true, 'A projectile spawned inside cover is absorbed');
});

test('districts and ground motorpool support open-world navigation', () => {
  assert.deepEqual(world.spawnPoint,{x:-65,z:175,y:0});
  assert.equal(world.districtAt(-65,175),'MOTOR POOL');
  assert.equal(world.districtAt(-100,40),'REFINERY');
  assert.equal(world.districtAt(100,40),'CARGO YARDS');
  assert.equal(world.districtAt(0,-100),'MILITARY UPLINK');
});

test('navigation reaches ground objectives around cargo and uses freeway ramp for uplink', async () => {
  const {buildRoute}=await import('../route.js');
  for(const target of world.objectives){
    const route=buildRoute(world.spawnPoint,target,world);
    assert.ok(route.length>1);
    assert.deepEqual(route.at(-1),{x:target.x,y:target.y,z:target.z});
    if(target.y>8){assert.ok(route.some(p=>p.x===0&&p.z===210));continue;}
    let previous=world.spawnPoint;
    for(const point of route){
      const distance=Math.hypot(point.x-previous.x,point.z-previous.z),steps=Math.ceil(distance/.5);
      for(let i=0;i<=steps;i++){const t=steps?i/steps:0;const p={x:previous.x+(point.x-previous.x)*t,y:0,z:previous.z+(point.z-previous.z)*t};assert.equal(world.pushOut(p,1.1),false,`Blocked route at ${JSON.stringify(p)}`);}
      previous=point;
    }
  }
  const descent=buildRoute(world.objectives[0],world.spawnPoint,world);
  assert.equal(descent[0].y,0);
  assert.deepEqual(descent.at(-1),{x:-65,y:0,z:175});
});
