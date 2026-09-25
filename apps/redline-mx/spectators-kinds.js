// Low-poly spectator kinds for spectators.js. Every kind is a list of parts;
// each part becomes ONE InstancedMesh shared by every spectator of that kind.
// A part's geometry is authored relative to its pivot (see `pivots`) so arms,
// heads and tails can rotate. Spectators face +z (toward the camera).
//
// part: { id, geo, mat: 'std'|'shag'|'glow'|'holo'|'halo'|'sign', anim: 'body'|'head'|'armL'|'armR'|'tail',
//         color(look) -> css colour, has(look) -> bool (optional) }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- geometry helpers ----------
const at = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};
const box = (w, h, d, x, y, z, rx, ry, rz) => at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 7, hs = 5) => {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  return at(g, x, y, z);
};
const ico = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(sx, sy, sz);
  return at(g, x, y, z);
};
const cyl = (rt, rb, h, x, y, z, seg = 8, rx, ry, rz) => at(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);
const cone = (r, h, x, y, z, seg = 8, rx, ry, rz) => at(new THREE.ConeGeometry(r, h, seg), x, y, z, rx, ry, rz);
const plane = (w, h, x, y, z, ws = 1, hs = 1) => at(new THREE.PlaneGeometry(w, h, ws, hs), x, y, z);
export const merge = (...gs) => {
  if (gs.every((g) => g.index)) {
    const m = mergeGeometries(gs);
    gs.forEach((g) => g.dispose());
    return m;
  }
  const flat = gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    return n;
  });
  const m = mergeGeometries(flat);
  flat.forEach((g) => g.dispose());
  return m;
};
export const G = { box, sph, ico, cyl, cone, plane, at, merge };

// ---------- palettes ----------
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
export const SKIN = ['#f6d5b8', '#eabf9a', '#d7a27a', '#c08658', '#9c6440', '#7a4a2c', '#5a3520', '#f1c7a3'];
const SHIRT = ['#e63946', '#f4a261', '#ffd23f', '#3bceac', '#2a9df4', '#6a4cff', '#ff5d8f', '#ffffff', '#1f1f1f', '#7bd389', '#ff7b00', '#00b4d8', '#c1121f', '#9d4edd'];
const PANTS = ['#2b3a55', '#3a3a3a', '#4a5a7a', '#6b5a44', '#222222', '#355e3b', '#5a2a2a', '#7c8a9a'];
const HAIR = ['#1a1208', '#3b2414', '#6b4a2a', '#c9a050', '#8a2a10', '#222222', '#d8d8d8', '#e0b060'];
const HATS = ['#e63946', '#1d3557', '#ffd23f', '#ffffff', '#2a9df4', '#111111', '#ff7b00', '#3bceac'];
const NEON = ['#39ff14', '#ff2d95', '#00e5ff', '#ffe600', '#bf5bff', '#ff6a00'];
const FOAM = ['#ffd23f', '#e63946', '#2a9df4', '#39d353', '#ff7b00'];

// Props any humanoid with a right arm can carry: sign (both hands up), foam
// finger, and at night glowsticks / phone lights with an additive halo.
function props(armLen, signY, signW = 1.3) {
  const hand = -armLen - 0.06;
  return [
    { id: 'sign', geo: plane(signW, signW / 2, 0, 0, 0.06), mat: 'sign', anim: 'body', pivot: [0, signY, 0], color: () => '#ffffff', has: (l) => l.sign },
    { id: 'signStick', geo: merge(box(0.05, 0.5, 0.05, -signW * 0.3, -0.35, 0.02), box(0.05, 0.5, 0.05, signW * 0.3, -0.35, 0.02)), mat: 'std', anim: 'body', pivot: [0, signY, 0], color: () => '#8a6a44', has: (l) => l.sign },
    {
      id: 'foam',
      geo: merge(box(0.28, 0.26, 0.16, 0, hand - 0.08, 0.03), box(0.1, 0.34, 0.1, 0.06, hand - 0.36, 0.03), box(0.08, 0.12, 0.08, -0.16, hand - 0.08, 0.05)),
      mat: 'std', anim: 'armR', color: (l) => l.foamC, has: (l) => l.foam,
    },
    { id: 'stick', geo: cyl(0.04, 0.04, 0.6, 0, hand - 0.15, 0.06, 6), mat: 'glow', anim: 'armR', color: (l) => l.glowC, has: (l) => l.glow },
    { id: 'phone', geo: box(0.13, 0.22, 0.03, 0, hand - 0.08, 0.1), mat: 'glow', anim: 'armR', color: () => '#eaf6ff', has: (l) => l.phone },
    { id: 'halo', geo: plane(1.1, 1.1, 0, hand - 0.12, 0.14), mat: 'halo', anim: 'armR', color: (l) => (l.glow ? l.glowC : '#8fc8ff'), has: (l) => l.glow || l.phone },
  ];
}

// ---------- humanoid builder (human / cowboy / hologram share it) ----------
function humanParts({ holo = false, cowboy = false } = {}) {
  const m = holo ? 'holo' : 'std';
  const parts = [
    { id: 'legs', geo: merge(box(0.2, 0.8, 0.24, -0.11, 0.4, 0), box(0.2, 0.8, 0.24, 0.11, 0.4, 0)), mat: m, anim: 'body', color: (l) => l.pants },
    { id: 'torso', geo: box(0.58, 0.66, 0.32, 0, 1.12, 0), mat: m, anim: 'body', color: (l) => l.shirt },
    { id: 'head', geo: sph(0.21, 0, 0.2, 0), mat: m, anim: 'head', color: (l) => l.skin },
    { id: 'armL', geo: box(0.16, 0.62, 0.17, 0, -0.29, 0), mat: m, anim: 'armL', color: (l) => l.shirt },
    { id: 'armR', geo: box(0.16, 0.62, 0.17, 0, -0.29, 0), mat: m, anim: 'armR', color: (l) => l.shirt },
    { id: 'handL', geo: box(0.15, 0.15, 0.15, 0, -0.64, 0), mat: m, anim: 'armL', color: (l) => l.skin },
    { id: 'handR', geo: box(0.15, 0.15, 0.15, 0, -0.64, 0), mat: m, anim: 'armR', color: (l) => l.skin },
  ];
  if (holo) {
    parts.push({ id: 'visor', geo: box(0.34, 0.08, 0.05, 0, 0.24, 0.19), mat: 'glow', anim: 'head', color: () => '#ffffff' });
    return parts;
  }
  if (cowboy) {
    parts.push(
      { id: 'hat', geo: merge(cyl(0.42, 0.42, 0.04, 0, 0.32, 0, 12), cyl(0.18, 0.22, 0.26, 0, 0.46, 0, 10)), mat: 'std', anim: 'head', color: (l) => l.hatC },
      { id: 'band', geo: cyl(0.225, 0.225, 0.06, 0, 0.36, 0, 10), mat: 'std', anim: 'head', color: (l) => l.bandC },
      { id: 'bandana', geo: box(0.3, 0.12, 0.05, 0, 1.4, 0.16), mat: 'std', anim: 'body', color: (l) => l.bandana },
      { id: 'mustache', geo: box(0.16, 0.04, 0.03, 0, 0.13, 0.2), mat: 'std', anim: 'head', color: (l) => l.hair, has: (l) => l.stache },
    );
  } else {
    parts.push(
      { id: 'hair', geo: sph(0.225, 0, 0.26, -0.03, 1, 0.8, 1), mat: 'std', anim: 'head', color: (l) => l.hair, has: (l) => l.hat === 0 },
      { id: 'cap', geo: merge(sph(0.22, 0, 0.27, 0, 1, 0.7, 1), box(0.32, 0.03, 0.24, 0, 0.3, 0.18)), mat: 'std', anim: 'head', color: (l) => l.hatC, has: (l) => l.hat === 1 },
      { id: 'beanie', geo: merge(sph(0.225, 0, 0.29, 0, 1, 0.95, 1), sph(0.08, 0, 0.52, 0, 1, 1, 1, 6, 4)), mat: 'std', anim: 'head', color: (l) => l.hatC, has: (l) => l.hat === 2 },
      { id: 'afro', geo: sph(0.3, 0, 0.3, -0.05, 1, 0.9, 1), mat: 'std', anim: 'head', color: (l) => l.hair, has: (l) => l.hat === 3 },
    );
  }
  return parts;
}
const HUMAN_PIVOTS = { armL: [-0.37, 1.4, 0], armR: [0.37, 1.4, 0], head: [0, 1.46, 0] };

export const KINDS = {
  human: {
    scale: [0.88, 1.08], headY: 1.7, modes: [0.3, 0.32, 0.26, 0.12], sway: 0,
    pivots: HUMAN_PIVOTS,
    parts: [...humanParts(), ...props(0.62, 2.35)],
    look: (rng, biome) => ({
      skin: pick(rng, SKIN), shirt: pick(rng, SHIRT), pants: pick(rng, PANTS), hair: pick(rng, HAIR), hatC: pick(rng, HATS),
      hat: biome.id === 'alpine' ? (rng() < 0.6 ? 2 : rng() < 0.5 ? 1 : 0) : rng() < 0.35 ? 1 : rng() < 0.12 ? 3 : rng() < 0.08 ? 2 : 0,
    }),
  },
  cowboy: {
    scale: [0.92, 1.1], headY: 1.75, modes: [0.3, 0.4, 0.22, 0.08], sway: 0,
    pivots: HUMAN_PIVOTS,
    parts: [...humanParts({ cowboy: true }), ...props(0.62, 2.35)],
    look: (rng) => ({
      skin: pick(rng, SKIN), shirt: pick(rng, ['#b5462f', '#6b8e9f', '#d8c7a0', '#8a2a2a', '#3f5f8a', '#f0ead8', '#5a7a3a']),
      pants: pick(rng, ['#2f4a70', '#3a4a64', '#6b5a44']), hair: pick(rng, HAIR),
      hatC: pick(rng, ['#6b4423', '#8a5a2e', '#c8a060', '#2a1a10', '#f0e6d0']), bandC: pick(rng, ['#2a1a10', '#b5462f', '#d4af37']),
      bandana: pick(rng, ['#c1121f', '#1d3557', '#d4af37']), stache: rng() < 0.5,
    }),
  },
  hologram: {
    scale: [0.9, 1.08], headY: 1.7, modes: [0.35, 0.35, 0.3, 0], sway: 0, holo: true,
    pivots: HUMAN_PIVOTS,
    parts: humanParts({ holo: true }),
    look: (rng) => {
      const c = rng() < 0.7 ? '#22d8ff' : rng() < 0.5 ? '#ff3bd4' : '#48ff9a';
      return { skin: c, shirt: c, pants: c };
    },
  },
  robot: {
    scale: [0.9, 1.1], headY: 1.7, modes: [0.35, 0.3, 0.27, 0.08], sway: 0,
    pivots: { armL: [-0.41, 1.34, 0], armR: [0.41, 1.34, 0], head: [0, 1.42, 0] },
    parts: [
      { id: 'legs', geo: merge(box(0.18, 0.76, 0.22, -0.13, 0.38, 0), box(0.18, 0.76, 0.22, 0.13, 0.38, 0), box(0.5, 0.1, 0.26, 0, 0.78, 0)), mat: 'std', anim: 'body', color: (l) => l.dark },
      { id: 'torso', geo: box(0.64, 0.62, 0.42, 0, 1.1, 0), mat: 'std', anim: 'body', color: (l) => l.metal },
      { id: 'chest', geo: merge(box(0.24, 0.12, 0.03, 0, 1.2, 0.22), box(0.06, 0.06, 0.03, -0.18, 1.0, 0.22), box(0.06, 0.06, 0.03, 0.18, 1.0, 0.22)), mat: 'glow', anim: 'body', color: (l) => l.eye },
      { id: 'head', geo: merge(box(0.46, 0.36, 0.4, 0, 0.2, 0), cyl(0.02, 0.02, 0.28, 0, 0.5, 0, 5), box(0.06, 0.16, 0.16, -0.26, 0.2, 0), box(0.06, 0.16, 0.16, 0.26, 0.2, 0)), mat: 'std', anim: 'head', color: (l) => l.metal },
      { id: 'eyes', geo: merge(box(0.12, 0.08, 0.03, -0.1, 0.22, 0.2), box(0.12, 0.08, 0.03, 0.1, 0.22, 0.2), sph(0.065, 0, 0.66, 0, 1, 1, 1, 6, 4)), mat: 'glow', anim: 'head', color: (l) => l.eye },
      { id: 'armL', geo: merge(box(0.14, 0.58, 0.14, 0, -0.29, 0), box(0.2, 0.14, 0.2, 0, -0.62, 0)), mat: 'std', anim: 'armL', color: (l) => l.dark },
      { id: 'armR', geo: merge(box(0.14, 0.58, 0.14, 0, -0.29, 0), box(0.2, 0.14, 0.2, 0, -0.62, 0)), mat: 'std', anim: 'armR', color: (l) => l.dark },
      ...props(0.64, 2.3),
    ],
    look: (rng) => {
      const metal = pick(rng, ['#b8c2cc', '#d0d6dc', '#8a96a4', '#d4a84a', '#c0503a', '#3a6ea8', '#e8e8e8', '#5ab0a0']);
      return { metal, dark: pick(rng, ['#4a525c', '#5d6670', '#353b42']), eye: pick(rng, ['#ff2d2d', '#00e5ff', '#7cff4a', '#ffb300', '#ff2dd8']) };
    },
  },
  alien: {
    scale: [0.85, 1.05], headY: 1.8, modes: [0.3, 0.35, 0.3, 0.05], sway: 0,
    pivots: { armL: [-0.28, 1.28, 0], armR: [0.28, 1.28, 0], head: [0, 1.34, 0] },
    parts: [
      { id: 'legs', geo: merge(box(0.13, 0.78, 0.16, -0.09, 0.39, 0), box(0.13, 0.78, 0.16, 0.09, 0.39, 0)), mat: 'std', anim: 'body', color: (l) => l.suit },
      { id: 'torso', geo: box(0.44, 0.58, 0.26, 0, 1.06, 0), mat: 'std', anim: 'body', color: (l) => l.suit },
      { id: 'head', geo: merge(sph(0.33, 0, 0.38, 0, 1, 1.18, 0.95, 10, 8), cyl(0.018, 0.018, 0.34, -0.14, 0.82, 0, 4, 0, 0, 0.35), cyl(0.018, 0.018, 0.34, 0.14, 0.82, 0, 4, 0, 0, -0.35)), mat: 'std', anim: 'head', color: (l) => l.skin },
      { id: 'eyes', geo: merge(at(sph(0.1, 0, 0, 0, 1, 1.7, 0.55), -0.14, 0.36, 0.27, 0, 0, 0.45), at(sph(0.1, 0, 0, 0, 1, 1.7, 0.55), 0.14, 0.36, 0.27, 0, 0, -0.45)), mat: 'std', anim: 'head', color: () => '#0b0b12' },
      { id: 'bobbles', geo: merge(sph(0.06, -0.2, 0.98, 0, 1, 1, 1, 6, 4), sph(0.06, 0.2, 0.98, 0, 1, 1, 1, 6, 4)), mat: 'glow', anim: 'head', color: (l) => l.glow },
      { id: 'armL', geo: box(0.1, 0.62, 0.1, 0, -0.31, 0), mat: 'std', anim: 'armL', color: (l) => l.skin },
      { id: 'armR', geo: box(0.1, 0.62, 0.1, 0, -0.31, 0), mat: 'std', anim: 'armR', color: (l) => l.skin },
      { id: 'hands', geo: sph(0.08, 0, -0.64, 0, 1.2, 1, 0.7, 6, 4), mat: 'std', anim: 'armL', color: (l) => l.skin },
      { id: 'handR', geo: sph(0.08, 0, -0.64, 0, 1.2, 1, 0.7, 6, 4), mat: 'std', anim: 'armR', color: (l) => l.skin },
      ...props(0.62, 2.35),
    ],
    look: (rng) => ({
      skin: pick(rng, ['#6fdc4a', '#4cc26b', '#9be86a', '#3fbfa0', '#8ee04a']),
      suit: pick(rng, ['#c0c8d8', '#6a3fa0', '#2a2a3a', '#d8d0f0', '#3a8a8a']),
      glow: pick(rng, ['#ff3bd4', '#fff04a', '#39ff14', '#00e5ff']),
    }),
  },
  yeti: {
    scale: [1.1, 1.3], headY: 1.9, modes: [0.3, 0.3, 0.4, 0], sway: 0.05,
    pivots: { armL: [-0.5, 1.42, 0], armR: [0.5, 1.42, 0], head: [0, 1.6, 0] },
    parts: [
      { id: 'legs', geo: merge(ico(0.2, -0.2, 0.26, 0, 1, 1.4, 1), ico(0.2, 0.2, 0.26, 0, 1, 1.4, 1)), mat: 'shag', anim: 'body', color: (l) => l.fur },
      { id: 'body', geo: ico(0.52, 0, 1.0, 0, 1, 1.25, 0.85), mat: 'shag', anim: 'body', color: (l) => l.fur },
      { id: 'head', geo: merge(ico(0.32, 0, 0.2, 0, 1, 1.05, 1), cone(0.07, 0.2, -0.2, 0.52, 0, 5, 0, 0, 0.4), cone(0.07, 0.2, 0.2, 0.52, 0, 5, 0, 0, -0.4)), mat: 'shag', anim: 'head', color: (l) => l.fur },
      { id: 'face', geo: box(0.32, 0.28, 0.08, 0, 0.14, 0.27), mat: 'std', anim: 'head', color: (l) => l.face },
      { id: 'features', geo: merge(box(0.07, 0.07, 0.03, -0.08, 0.2, 0.32), box(0.07, 0.07, 0.03, 0.08, 0.2, 0.32), box(0.16, 0.05, 0.03, 0, 0.06, 0.32)), mat: 'std', anim: 'head', color: () => '#141824' },
      { id: 'armL', geo: ico(0.17, 0, -0.42, 0, 1, 2.8, 1), mat: 'shag', anim: 'armL', color: (l) => l.fur },
      { id: 'armR', geo: ico(0.17, 0, -0.42, 0, 1, 2.8, 1), mat: 'shag', anim: 'armR', color: (l) => l.fur },
    ],
    look: (rng) => ({ fur: pick(rng, ['#f4f7fb', '#e8eef5', '#fdfdfd', '#dfe6ef']), face: pick(rng, ['#7f97b5', '#8aa0b8', '#6f86a3']) }),
  },
  penguin: {
    scale: [0.8, 1.0], headY: 1.1, modes: [0.35, 0.3, 0.35, 0], sway: 0.12, armScale: 0.55,
    pivots: { armL: [-0.33, 0.84, 0], armR: [0.33, 0.84, 0], head: [0, 0.98, 0] },
    parts: [
      { id: 'body', geo: sph(0.34, 0, 0.55, 0, 1, 1.45, 0.95, 10, 8), mat: 'std', anim: 'body', color: () => '#1d2230' },
      { id: 'belly', geo: sph(0.27, 0, 0.5, 0.12, 1, 1.35, 0.8, 10, 8), mat: 'std', anim: 'body', color: () => '#f6f8fb' },
      { id: 'feet', geo: merge(box(0.14, 0.05, 0.24, -0.11, 0.03, 0.12), box(0.14, 0.05, 0.24, 0.11, 0.03, 0.12)), mat: 'std', anim: 'body', color: () => '#ff9a1f' },
      { id: 'scarf', geo: cyl(0.25, 0.27, 0.09, 0, 0.86, 0, 10), mat: 'std', anim: 'body', color: (l) => l.scarf, has: (l) => !!l.scarf },
      { id: 'head', geo: merge(sph(0.22, 0, 0.12, 0), sph(0.035, -0.07, 0.17, 0.2, 1, 1, 1, 5, 4), sph(0.035, 0.07, 0.17, 0.2, 1, 1, 1, 5, 4)), mat: 'std', anim: 'head', color: () => '#1d2230' },
      { id: 'face', geo: sph(0.15, 0, 0.1, 0.11, 1, 1, 0.6), mat: 'std', anim: 'head', color: () => '#f6f8fb' },
      { id: 'beak', geo: cone(0.06, 0.2, 0, 0.07, 0.26, 6, Math.PI / 2), mat: 'std', anim: 'head', color: () => '#ff9a1f' },
      { id: 'armL', geo: box(0.07, 0.46, 0.2, 0, -0.21, 0), mat: 'std', anim: 'armL', color: () => '#1d2230' },
      { id: 'armR', geo: box(0.07, 0.46, 0.2, 0, -0.21, 0), mat: 'std', anim: 'armR', color: () => '#1d2230' },
    ],
    look: (rng) => ({ scarf: rng() < 0.45 ? pick(rng, ['#e63946', '#2a9df4', '#ffd23f', '#3bceac']) : null }),
  },
  monkey: {
    scale: [0.85, 1.05], headY: 1.2, modes: [0.25, 0.35, 0.35, 0.05], sway: 0.1,
    pivots: { armL: [-0.26, 0.9, 0], armR: [0.26, 0.9, 0], head: [0, 1.0, 0], tail: [0, 0.42, -0.18] },
    parts: [
      { id: 'legs', geo: merge(box(0.14, 0.46, 0.16, -0.11, 0.23, 0), box(0.14, 0.46, 0.16, 0.11, 0.23, 0)), mat: 'std', anim: 'body', color: (l) => l.fur },
      { id: 'torso', geo: sph(0.27, 0, 0.72, 0, 1, 1.25, 0.85), mat: 'std', anim: 'body', color: (l) => l.fur },
      { id: 'belly', geo: sph(0.19, 0, 0.68, 0.11, 1, 1.2, 0.7), mat: 'std', anim: 'body', color: (l) => l.face },
      { id: 'head', geo: merge(sph(0.24, 0, 0.18, 0), sph(0.1, -0.26, 0.2, 0, 1, 1, 0.5), sph(0.1, 0.26, 0.2, 0, 1, 1, 0.5)), mat: 'std', anim: 'head', color: (l) => l.fur },
      { id: 'face', geo: merge(sph(0.17, 0, 0.13, 0.13, 1, 0.9, 0.6), sph(0.07, -0.25, 0.2, 0.03, 1, 1, 0.4, 6, 4), sph(0.07, 0.25, 0.2, 0.03, 1, 1, 0.4, 6, 4)), mat: 'std', anim: 'head', color: (l) => l.face },
      { id: 'eyes', geo: merge(sph(0.035, -0.07, 0.2, 0.22, 1, 1, 1, 5, 4), sph(0.035, 0.07, 0.2, 0.22, 1, 1, 1, 5, 4), box(0.1, 0.025, 0.02, 0, 0.06, 0.24)), mat: 'std', anim: 'head', color: () => '#141008' },
      { id: 'armL', geo: box(0.1, 0.62, 0.1, 0, -0.31, 0), mat: 'std', anim: 'armL', color: (l) => l.fur },
      { id: 'armR', geo: box(0.1, 0.62, 0.1, 0, -0.31, 0), mat: 'std', anim: 'armR', color: (l) => l.fur },
      { id: 'tail', geo: merge(cyl(0.035, 0.035, 0.6, 0, 0.23, -0.2, 5, -0.72), sph(0.06, 0, 0.5, -0.4, 1, 1, 1, 5, 4)), mat: 'std', anim: 'tail', color: (l) => l.fur },
      ...props(0.62, 1.85, 1.1),
    ],
    look: (rng) => ({ fur: pick(rng, ['#6b4423', '#5a3a1e', '#8a5a2e', '#3d2a1a', '#7a5030']), face: pick(rng, ['#e8c49a', '#f0d2aa', '#d8b088']) }),
  },
  tiki: {
    scale: [0.95, 1.1], headY: 1.9, modes: [0.3, 0.3, 0.4, 0], sway: 0.04,
    pivots: { armL: [-0.34, 1.36, 0], armR: [0.34, 1.36, 0], head: [0, 1.4, 0] },
    parts: [
      { id: 'legs', geo: merge(box(0.18, 0.72, 0.22, -0.11, 0.36, 0), box(0.18, 0.72, 0.22, 0.11, 0.36, 0)), mat: 'std', anim: 'body', color: (l) => l.skin },
      { id: 'torso', geo: box(0.5, 0.62, 0.28, 0, 1.08, 0), mat: 'std', anim: 'body', color: (l) => l.skin },
      { id: 'skirt', geo: cyl(0.27, 0.44, 0.56, 0, 0.62, 0, 10), mat: 'shag', anim: 'body', color: (l) => l.skirt },
      { id: 'mask', geo: merge(box(0.5, 0.8, 0.18, 0, 0.36, 0.04), box(0.6, 0.16, 0.2, 0, 0.66, 0.04)), mat: 'std', anim: 'head', color: (l) => l.mask },
      { id: 'maskFace', geo: merge(box(0.13, 0.1, 0.03, -0.12, 0.5, 0.14), box(0.13, 0.1, 0.03, 0.12, 0.5, 0.14), box(0.32, 0.14, 0.03, 0, 0.18, 0.14), box(0.07, 0.2, 0.05, 0, 0.36, 0.15)), mat: 'std', anim: 'head', color: () => '#f2ead2' },
      { id: 'feathers', geo: merge(...[-0.5, -0.25, 0, 0.25, 0.5].map((a) => box(0.08, 0.42, 0.04, Math.sin(a) * 0.26, 0.9 + Math.cos(a) * 0.1, 0, 0, 0, -a))), mat: 'std', anim: 'head', color: (l) => l.feather },
      { id: 'armL', geo: box(0.14, 0.62, 0.15, 0, -0.3, 0), mat: 'std', anim: 'armL', color: (l) => l.skin },
      { id: 'armR', geo: merge(box(0.14, 0.62, 0.15, 0, -0.3, 0)), mat: 'std', anim: 'armR', color: (l) => l.skin },
      { id: 'torch', geo: merge(cyl(0.035, 0.035, 0.7, 0, -0.62, 0.08, 5)), mat: 'std', anim: 'armL', color: () => '#6b4423', has: (l) => l.torch },
      { id: 'flame', geo: cone(0.1, 0.26, 0, -1.02, 0.08, 6, Math.PI), mat: 'glow', anim: 'armL', color: () => '#ffa31a', has: (l) => l.torch },
      ...props(0.62, 2.45).filter((p) => p.id !== 'sign' && p.id !== 'signStick'),
    ],
    look: (rng) => ({
      skin: pick(rng, ['#8a5a3a', '#6b4430', '#a0704a', '#7a4a2c']),
      skirt: pick(rng, ['#c8b04a', '#8aa03a', '#d8c070']),
      mask: pick(rng, ['#8a4a22', '#b0602a', '#2a8a7a', '#a02a2a', '#c89030', '#5a3a1a']),
      feather: pick(rng, ['#ff3b3b', '#ffd23f', '#39d353', '#00c2d8', '#ff7b00']),
      torch: rng() < 0.25,
    }),
  },
  mascot: {
    scale: [1.1, 1.25], headY: 3.0, modes: [0.2, 0.4, 0.4, 0], sway: 0.2,
    pivots: { armL: [-0.74, 1.62, 0], armR: [0.74, 1.62, 0], head: [0, 1.95, 0] },
    parts: [
      { id: 'feet', geo: merge(sph(0.3, -0.3, 0.14, 0.1, 1, 0.6, 1.4), sph(0.3, 0.3, 0.14, 0.1, 1, 0.6, 1.4)), mat: 'std', anim: 'body', color: (l) => l.b },
      { id: 'body', geo: sph(0.76, 0, 1.15, 0, 1, 1.12, 0.9, 12, 10), mat: 'std', anim: 'body', color: (l) => l.a },
      { id: 'belly', geo: sph(0.56, 0, 1.05, 0.26, 1, 1.1, 0.6, 10, 8), mat: 'std', anim: 'body', color: (l) => l.belly },
      { id: 'head', geo: merge(sph(0.6, 0, 0.5, 0, 1, 0.95, 0.95, 12, 10), sph(0.16, -0.5, 0.9, 0, 1, 1, 0.6, 6, 4), sph(0.16, 0.5, 0.9, 0, 1, 1, 0.6, 6, 4)), mat: 'std', anim: 'head', color: (l) => l.a },
      { id: 'eyes', geo: merge(sph(0.17, -0.2, 0.64, 0.45, 1, 1.25, 0.6), sph(0.17, 0.2, 0.64, 0.45, 1, 1.25, 0.6)), mat: 'std', anim: 'head', color: () => '#ffffff' },
      { id: 'pupils', geo: merge(sph(0.08, -0.19, 0.64, 0.55, 1, 1.2, 0.6, 6, 4), sph(0.08, 0.19, 0.64, 0.55, 1, 1.2, 0.6, 6, 4), box(0.36, 0.1, 0.06, 0, 0.3, 0.55)), mat: 'std', anim: 'head', color: () => '#111111' },
      { id: 'hat', geo: merge(cone(0.24, 0.6, 0, 1.2, 0, 10), sph(0.09, 0, 1.52, 0, 1, 1, 1, 6, 4)), mat: 'std', anim: 'head', color: (l) => l.b },
      { id: 'armL', geo: merge(cyl(0.17, 0.17, 0.9, 0, -0.45, 0, 8), sph(0.22, 0, -0.95, 0)), mat: 'std', anim: 'armL', color: (l) => l.a },
      { id: 'armR', geo: merge(cyl(0.17, 0.17, 0.9, 0, -0.45, 0, 8), sph(0.22, 0, -0.95, 0)), mat: 'std', anim: 'armR', color: (l) => l.a },
    ],
    look: (rng) => {
      const pal = pick(rng, [['#ffd23f', '#e63946'], ['#ff5d8f', '#ffd23f'], ['#3bceac', '#6a4cff'], ['#ff7b00', '#2a9df4'], ['#7bd389', '#ff2d95'], ['#2a9df4', '#ffd23f']]);
      return { a: pal[0], b: pal[1], belly: '#fff6e0' };
    },
  },
  dog: {
    scale: [0.9, 1.15], headY: 0.85, modes: [1, 0, 0, 0], sway: 0, noArms: true,
    pivots: { head: [0, 0.66, 0.12], tail: [0, 0.16, -0.26] },
    parts: [
      {
        id: 'body',
        geo: merge(box(0.32, 0.5, 0.32, 0, 0.4, 0.02, -0.35), sph(0.22, 0, 0.2, -0.13, 1, 0.8, 1.2), box(0.08, 0.38, 0.08, -0.09, 0.19, 0.17), box(0.08, 0.38, 0.08, 0.09, 0.19, 0.17)),
        mat: 'std', anim: 'body', color: (l) => l.coat,
      },
      { id: 'collar', geo: cyl(0.14, 0.15, 0.06, 0, 0.6, 0.08, 8), mat: 'std', anim: 'body', color: (l) => l.collar },
      { id: 'head', geo: merge(sph(0.17, 0, 0.08, 0.02, 1, 0.95, 1), box(0.14, 0.12, 0.2, 0, 0.02, 0.16)), mat: 'std', anim: 'head', color: (l) => l.coat },
      { id: 'ears', geo: merge(box(0.07, 0.2, 0.1, -0.14, 0.06, -0.01, 0, 0, 0.3), box(0.07, 0.2, 0.1, 0.14, 0.06, -0.01, 0, 0, -0.3)), mat: 'std', anim: 'head', color: (l) => l.ear },
      { id: 'face', geo: merge(sph(0.04, 0, 0.07, 0.27, 1, 1, 1, 5, 4), sph(0.028, -0.07, 0.14, 0.15, 1, 1, 1, 5, 4), sph(0.028, 0.07, 0.14, 0.15, 1, 1, 1, 5, 4)), mat: 'std', anim: 'head', color: () => '#111111' },
      { id: 'tongue', geo: box(0.06, 0.02, 0.09, 0, -0.04, 0.24), mat: 'std', anim: 'head', color: () => '#ff6f8a' },
      { id: 'tail', geo: box(0.06, 0.06, 0.34, 0, 0.1, -0.13, 0.6), mat: 'std', anim: 'tail', color: (l) => l.coat },
    ],
    look: (rng) => {
      const coat = pick(rng, ['#c89048', '#6b4423', '#1f1f1f', '#f0e6d8', '#8a8a8a', '#d8b070', '#a0522d']);
      return { coat, ear: pick(rng, ['#4a2c14', '#2a1a10', coat, '#f0e6d8']), collar: pick(rng, ['#e63946', '#2a9df4', '#ffd23f', '#39d353']) };
    },
  },
};
KINDS.hologram.parts.forEach((p) => { if (p.mat === 'std') p.mat = 'holo'; });

// Props owned by the spectator rather than the kind (shared across humanoids).
export function propLook(rng, mode, night) {
  const l = {};
  l.sign = mode === 3;
  l.tile = Math.floor(rng() * 16);
  l.foam = !l.sign && rng() < 0.1;
  l.foamC = pick(rng, FOAM);
  l.glow = night && !l.sign && !l.foam && rng() < 0.5;
  l.glowC = pick(rng, NEON);
  l.phone = night && !l.sign && !l.glow && rng() < 0.45;
  return l;
}
