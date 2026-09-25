// Low-poly critter rigs for wildlife.js. Every rig is a list of "bones";
// each bone is a handful of primitives merged into ONE vertex-coloured
// geometry, so a species costs one InstancedMesh per bone no matter how
// many animals are alive. Rigs face +x, stand on y = 0, left side is +z.
//
// pose(a, P, t) receives an animal state `a` and fills P[bone] with
// { rx, ry, rz, ox, oy, oz, s } (reset to rest every frame).
import * as THREE from 'three';

const PI = Math.PI;
const HALF = PI / 2;

const UNIT = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  ball: () => new THREE.SphereGeometry(0.5, 8, 6),
  cone: () => new THREE.ConeGeometry(0.5, 1, 6),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
};

// prim: [shape, color, pos, scale, rot]
const p = (shape, color, pos, scale, rot = [0, 0, 0]) => [shape, color, pos, scale, rot];
const mirror = (prims) => prims.map(([s, c, pos, sc, r]) => [s, c, [pos[0], pos[1], -pos[2]], sc, [-r[0], -r[1], r[2]]]);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function buildBoneGeometry(prims) {
  const pos = [];
  const col = [];
  for (const [shape, color, at, sc, rot] of prims) {
    const g = UNIT[shape]().toNonIndexed();
    _m.compose(_v.fromArray(at), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.fromArray(sc));
    g.applyMatrix4(_m);
    _c.set(color).convertSRGBToLinear();
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(_c.r, _c.g, _c.b);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ---------- shared pose helpers ----------
const EYE = '#111';

function birdPose(a, P) {
  if (a.air > 0.5) {
    const f = Math.sin(a.flap) * a.flapAmp;
    P.wingL.rx = -f - (a.dihedral || 0);
    P.wingR.rx = f + (a.dihedral || 0);
    if (P.legs) P.legs.s = 0;
    if (P.head) P.head.rz = 0.1;
  } else {
    P.wingL.ry = -1.35;
    P.wingR.ry = 1.35;
    P.wingL.rx = -0.25;
    P.wingR.rx = 0.25;
    if (P.head) {
      P.head.rz = -a.peck * 1.3;
      P.head.ox = Math.sin(a.phase * 2) * 0.03 * a.gait;
      P.head.ry = a.look;
    }
  }
}

function quadPose(a, P, o) {
  const sw = Math.sin(a.phase) * a.gait * (o.stride || 0.7);
  P.legFL.rz = sw;
  P.legBR.rz = sw;
  P.legFR.rz = -sw;
  P.legBL.rz = -sw;
  P.body.oy = Math.abs(Math.cos(a.phase)) * a.gait * 0.05;
  P.head.oy = P.body.oy;
  P.head.rz = -a.peck * (o.graze || 1) + (a.bark || 0) * 0.35;
  P.head.ry = a.look;
  if (P.tail) {
    P.tail.oy = P.body.oy;
    P.tail.ry = Math.sin(a.t * (o.wagSpeed || 12)) * (o.wag || 0.5) * (0.4 + a.happy);
  }
  if (a.sit > 0) {
    const k = a.sit;
    P.legBL.rz = P.legBR.rz = -1.3 * k;
    P.legFL.rz = P.legFR.rz = -(o.sitPitch || 0.5) * k;
    P.head.rz -= (o.sitPitch || 0.5) * k * 0.6;
  }
}

function copyBone(P, from, to) {
  const f = P[from];
  Object.assign(P[to], { rx: f.rx, ry: f.ry, rz: f.rz, ox: f.ox, oy: f.oy, oz: f.oz });
}

// Generic quadruped: body box + neck to head + 4 legs + tail.
function quad(o) {
  const hip = o.leg;
  const by = hip + o.bh * 0.25;
  const head = [o.len / 2 + o.headFwd, o.headUp];
  const A = [o.len * 0.38, o.bh * 0.25];
  const dx = head[0] - A[0];
  const dy = head[1] - A[1];
  const nl = Math.hypot(dx, dy);
  const hs = o.hs;
  const body = [
    p('box', o.fur, [0, 0, 0], [o.len, o.bh, o.bw]),
    p('box', o.fur, [(A[0] + head[0]) / 2, (A[1] + head[1]) / 2, 0], [nl + o.nw * 0.5, o.nw, o.nw * 0.9], [0, 0, Math.atan2(dy, dx)]),
    ...(o.bodyExtra || []),
  ];
  const headPrims = [
    p('box', o.headColor || o.fur, [hs * 0.1, 0, 0], [hs, hs * 0.85, hs * 0.85]),
    p('box', o.snoutColor || o.fur, [hs * 0.5 + o.snout / 2, -hs * 0.18, 0], [o.snout, hs * 0.48, hs * 0.55]),
    p('box', o.nose || EYE, [hs * 0.5 + o.snout, -hs * 0.08, 0], [hs * 0.12, hs * 0.16, hs * 0.2]),
    ...(o.glowEyes ? [] : [p('box', EYE, [hs * 0.45, hs * 0.14, hs * 0.3], [hs * 0.16, hs * 0.16, hs * 0.1]), p('box', EYE, [hs * 0.45, hs * 0.14, -hs * 0.3], [hs * 0.16, hs * 0.16, hs * 0.1])]),
    ...(o.headExtra || []),
  ];
  const lx = o.len / 2 - o.lw * 0.9;
  const lz = o.bw / 2 - o.lw * 0.55;
  const legPrims = [
    p('box', o.legColor || o.fur, [0, -hip / 2, 0], [o.lw, hip, o.lw]),
    p('box', o.foot || o.fur, [o.lw * 0.15, -hip + o.lw * 0.3, 0], [o.lw * 1.3, o.lw * 0.6, o.lw * 1.15]),
  ];
  const bones = [
    { name: 'body', at: [0, by, 0], prims: body, tint: true },
    { name: 'head', at: [head[0], by + head[1], 0], prims: headPrims, tint: o.tintHead !== false },
    { name: 'legFL', at: [lx, hip, lz], prims: legPrims, tint: true },
    { name: 'legFR', at: [lx, hip, -lz], prims: legPrims, tint: true },
    { name: 'legBL', at: [-lx, hip, lz], prims: legPrims, tint: true },
    { name: 'legBR', at: [-lx, hip, -lz], prims: legPrims, tint: true },
  ];
  if (o.tail) {
    const [tl, ta, tw] = o.tail;
    bones.push({
      name: 'tail', at: [-o.len / 2, by + o.bh * 0.3, 0], tint: true,
      prims: [p('box', o.tailColor || o.fur, [-Math.cos(ta) * tl / 2, Math.sin(ta) * tl / 2, 0], [tl, tw, tw], [0, 0, -ta]), ...(o.tailExtra || [])],
    });
  }
  if (o.glowEyes) {
    bones.push({
      name: 'eyes', at: [head[0], by + head[1], 0], glow: true,
      prims: [p('box', o.glowEyes, [hs * 0.6, hs * 0.14, hs * 0.26], [hs * 0.08, hs * 0.2, hs * 0.2]), p('box', o.glowEyes, [hs * 0.6, hs * 0.14, -hs * 0.26], [hs * 0.08, hs * 0.2, hs * 0.2])],
    });
  }
  return bones;
}

// ---------- rigs ----------
export const RIGS = {
  pigeon: {
    bones: [
      { name: 'body', at: [0, 0.2, 0], tint: true, prims: [
        p('ball', '#e4e6ea', [0, 0, 0], [0.38, 0.24, 0.22]),
        p('ball', '#9ec7b8', [0.12, 0.04, 0], [0.18, 0.2, 0.2]),
        p('box', '#55585e', [-0.24, 0.03, 0], [0.18, 0.03, 0.13], [0, 0, 0.25]),
      ] },
      { name: 'head', at: [0.15, 0.3, 0], tint: true, prims: [
        p('ball', '#d4d7dd', [0.03, 0, 0], [0.14, 0.14, 0.13]),
        p('cone', '#3a3a3a', [0.12, -0.01, 0], [0.04, 0.08, 0.04], [0, 0, -HALF]),
        p('box', '#ff7a1a', [0.06, 0.025, 0.066], [0.035, 0.035, 0.01]),
        p('box', '#ff7a1a', [0.06, 0.025, -0.066], [0.035, 0.035, 0.01]),
      ] },
      { name: 'wingL', at: [0.03, 0.25, 0.08], tint: true, prims: [
        p('box', '#c8ccd2', [-0.02, 0, 0.14], [0.2, 0.025, 0.28]),
        p('box', '#44474d', [-0.02, 0.005, 0.12], [0.03, 0.03, 0.22]),
        p('box', '#44474d', [-0.05, 0, 0.3], [0.13, 0.02, 0.08]),
      ] },
      { name: 'wingR', at: [0.03, 0.25, -0.08], tint: true, prims: mirror([
        p('box', '#c8ccd2', [-0.02, 0, 0.14], [0.2, 0.025, 0.28]),
        p('box', '#44474d', [-0.02, 0.005, 0.12], [0.03, 0.03, 0.22]),
        p('box', '#44474d', [-0.05, 0, 0.3], [0.13, 0.02, 0.08]),
      ]) },
      { name: 'legs', at: [0, 0.1, 0], prims: [
        p('box', '#e0554a', [0.02, -0.05, 0.045], [0.025, 0.11, 0.025]),
        p('box', '#e0554a', [0.02, -0.05, -0.045], [0.025, 0.11, 0.025]),
      ] },
    ],
    pose: birdPose,
  },

  parrot: {
    bones: [
      { name: 'body', at: [0, 0.24, 0], tint: true, prims: [
        p('ball', '#ffffff', [0, 0, 0], [0.34, 0.26, 0.22]),
        p('box', '#ffffff', [-0.3, -0.02, 0], [0.36, 0.03, 0.09], [0, 0, 0.12]),
        p('box', '#2a5fd8', [-0.34, -0.035, 0], [0.3, 0.02, 0.07], [0, 0, 0.12]),
      ] },
      { name: 'head', at: [0.15, 0.36, 0], tint: true, prims: [
        p('ball', '#ffffff', [0.03, 0, 0], [0.17, 0.16, 0.15]),
        p('box', '#f4f4f4', [0.08, 0.0, 0], [0.06, 0.08, 0.14]),
        p('cone', '#2a2a2a', [0.13, -0.035, 0], [0.07, 0.09, 0.06], [0, 0, -2.2]),
        p('box', EYE, [0.07, 0.025, 0.07], [0.03, 0.03, 0.01]),
        p('box', EYE, [0.07, 0.025, -0.07], [0.03, 0.03, 0.01]),
      ] },
      { name: 'wingL', at: [0.03, 0.3, 0.08], tint: true, prims: [
        p('box', '#ffffff', [-0.02, 0, 0.16], [0.2, 0.025, 0.32]),
        p('box', '#f5d020', [-0.03, 0.004, 0.14], [0.08, 0.026, 0.26]),
        p('box', '#2a5fd8', [-0.06, 0, 0.34], [0.14, 0.02, 0.1]),
      ] },
      { name: 'wingR', at: [0.03, 0.3, -0.08], tint: true, prims: mirror([
        p('box', '#ffffff', [-0.02, 0, 0.16], [0.2, 0.025, 0.32]),
        p('box', '#f5d020', [-0.03, 0.004, 0.14], [0.08, 0.026, 0.26]),
        p('box', '#2a5fd8', [-0.06, 0, 0.34], [0.14, 0.02, 0.1]),
      ]) },
      { name: 'legs', at: [0, 0.12, 0], prims: [
        p('box', '#555', [0.02, -0.06, 0.045], [0.03, 0.12, 0.03]),
        p('box', '#555', [0.02, -0.06, -0.045], [0.03, 0.12, 0.03]),
      ] },
    ],
    pose: birdPose,
  },

  vulture: {
    bones: [
      { name: 'body', at: [0, 0, 0], prims: [
        p('ball', '#2b2420', [0, 0, 0], [0.62, 0.28, 0.32]),
        p('ball', '#e6dccb', [0.24, 0.08, 0], [0.16, 0.15, 0.24]),
        p('box', '#231d19', [-0.4, 0, 0], [0.3, 0.04, 0.26]),
      ] },
      { name: 'head', at: [0.32, 0.12, 0], prims: [
        p('box', '#d08878', [0.07, 0, 0], [0.16, 0.06, 0.06], [0, 0, 0.3]),
        p('ball', '#d2503e', [0.17, 0.03, 0], [0.13, 0.11, 0.11]),
        p('cone', '#eee3c8', [0.26, 0.02, 0], [0.05, 0.1, 0.05], [0, 0, -HALF - 0.3]),
      ] },
      { name: 'wingL', at: [0.04, 0.06, 0.12], prims: [
        p('box', '#3a302a', [0, 0, 0.46], [0.36, 0.035, 0.92]),
        p('box', '#8a7a68', [-0.1, -0.02, 0.44], [0.12, 0.03, 0.86]),
        p('box', '#1d1814', [0.06, 0, 0.98], [0.07, 0.025, 0.24], [0, 0.35, 0]),
        p('box', '#1d1814', [-0.03, 0, 1.0], [0.07, 0.025, 0.26], [0, 0.1, 0]),
        p('box', '#1d1814', [-0.12, 0, 0.98], [0.07, 0.025, 0.24], [0, -0.2, 0]),
      ] },
      { name: 'wingR', at: [0.04, 0.06, -0.12], prims: mirror([
        p('box', '#3a302a', [0, 0, 0.46], [0.36, 0.035, 0.92]),
        p('box', '#8a7a68', [-0.1, -0.02, 0.44], [0.12, 0.03, 0.86]),
        p('box', '#1d1814', [0.06, 0, 0.98], [0.07, 0.025, 0.24], [0, 0.35, 0]),
        p('box', '#1d1814', [-0.03, 0, 1.0], [0.07, 0.025, 0.26], [0, 0.1, 0]),
        p('box', '#1d1814', [-0.12, 0, 0.98], [0.07, 0.025, 0.24], [0, -0.2, 0]),
      ]) },
    ],
    pose: birdPose,
  },

  eagle: {
    bones: [
      { name: 'body', at: [0, 0, 0], prims: [
        p('ball', '#5a3a20', [0, 0, 0], [0.62, 0.26, 0.3]),
        p('box', '#f4f1ea', [-0.42, 0, 0], [0.3, 0.04, 0.26]),
        p('box', '#e8b820', [0.05, -0.16, 0.06], [0.06, 0.1, 0.05]),
        p('box', '#e8b820', [0.05, -0.16, -0.06], [0.06, 0.1, 0.05]),
      ] },
      { name: 'head', at: [0.3, 0.06, 0], prims: [
        p('ball', '#f7f5ef', [0.08, 0.02, 0], [0.2, 0.16, 0.16]),
        p('cone', '#f0c020', [0.2, 0.0, 0], [0.07, 0.12, 0.06], [0, 0, -HALF - 0.4]),
        p('box', EYE, [0.12, 0.05, 0.075], [0.03, 0.03, 0.01]),
        p('box', EYE, [0.12, 0.05, -0.075], [0.03, 0.03, 0.01]),
      ] },
      { name: 'wingL', at: [0.04, 0.06, 0.12], prims: [
        p('box', '#6b4526', [0, 0, 0.5], [0.34, 0.035, 1.0]),
        p('box', '#3e2814', [0.05, 0, 1.06], [0.07, 0.025, 0.26], [0, 0.35, 0]),
        p('box', '#3e2814', [-0.04, 0, 1.08], [0.07, 0.025, 0.28], [0, 0.1, 0]),
        p('box', '#3e2814', [-0.12, 0, 1.05], [0.07, 0.025, 0.24], [0, -0.2, 0]),
      ] },
      { name: 'wingR', at: [0.04, 0.06, -0.12], prims: mirror([
        p('box', '#6b4526', [0, 0, 0.5], [0.34, 0.035, 1.0]),
        p('box', '#3e2814', [0.05, 0, 1.06], [0.07, 0.025, 0.26], [0, 0.35, 0]),
        p('box', '#3e2814', [-0.04, 0, 1.08], [0.07, 0.025, 0.28], [0, 0.1, 0]),
        p('box', '#3e2814', [-0.12, 0, 1.05], [0.07, 0.025, 0.24], [0, -0.2, 0]),
      ]) },
    ],
    pose: birdPose,
  },

  roadrunner: {
    bones: [
      { name: 'body', at: [0, 0.5, 0], prims: [
        p('ball', '#a88458', [0, 0, 0], [0.36, 0.2, 0.18]),
        p('ball', '#e4d6b8', [0.08, -0.05, 0], [0.22, 0.12, 0.15]),
        p('box', '#4a5a78', [-0.34, 0.1, 0], [0.42, 0.05, 0.09], [0, 0, 0.45]),
        p('box', '#f2efe6', [-0.53, 0.19, 0], [0.06, 0.055, 0.1], [0, 0, 0.45]),
        p('box', '#6a5238', [0, 0.02, 0.085], [0.24, 0.06, 0.02]),
        p('box', '#6a5238', [0, 0.02, -0.085], [0.24, 0.06, 0.02]),
      ] },
      { name: 'head', at: [0.17, 0.62, 0], prims: [
        p('ball', '#9a7a50', [0.03, 0.02, 0], [0.13, 0.12, 0.11]),
        p('box', '#3a4a68', [-0.03, 0.1, 0], [0.12, 0.07, 0.05], [0, 0, 0.5]),
        p('cone', '#2a2a2a', [0.16, 0.0, 0], [0.04, 0.16, 0.04], [0, 0, -HALF]),
        p('box', '#3ab0ff', [0.05, 0.03, 0.05], [0.05, 0.03, 0.02]),
        p('box', '#ff4a2a', [0.02, 0.01, 0.052], [0.04, 0.025, 0.02]),
        p('box', '#3ab0ff', [0.05, 0.03, -0.05], [0.05, 0.03, 0.02]),
        p('box', '#ff4a2a', [0.02, 0.01, -0.052], [0.04, 0.025, 0.02]),
      ] },
      { name: 'legL', at: [0, 0.42, 0.05], prims: [
        p('box', '#8a8a70', [0, -0.21, 0], [0.03, 0.42, 0.03]),
        p('box', '#8a8a70', [0.03, -0.41, 0], [0.1, 0.02, 0.03]),
      ] },
      { name: 'legR', at: [0, 0.42, -0.05], prims: [
        p('box', '#8a8a70', [0, -0.21, 0], [0.03, 0.42, 0.03]),
        p('box', '#8a8a70', [0.03, -0.41, 0], [0.1, 0.02, 0.03]),
      ] },
    ],
    pose(a, P) {
      const sw = Math.sin(a.phase) * a.gait * 1.1;
      P.legL.rz = sw;
      P.legR.rz = -sw;
      P.body.oy = Math.abs(Math.cos(a.phase)) * 0.04 * a.gait;
      P.head.oy = P.body.oy;
      P.head.rz = -a.peck * 0.8;
      P.head.ry = a.look;
    },
  },

  lizard: {
    bones: [
      { name: 'body', at: [0, 0.07, 0], tint: true, prims: [
        p('box', '#ffffff', [0, 0, 0], [0.42, 0.09, 0.16]),
        p('box', '#d8d0a0', [0, -0.03, 0], [0.36, 0.04, 0.14]),
        p('box', '#3a3a2a', [0, 0.05, 0], [0.3, 0.02, 0.05]),
      ] },
      { name: 'head', at: [0.21, 0.08, 0], tint: true, prims: [
        p('box', '#ffffff', [0.08, 0, 0], [0.17, 0.08, 0.12]),
        p('box', EYE, [0.08, 0.03, 0.06], [0.03, 0.03, 0.02]),
        p('box', EYE, [0.08, 0.03, -0.06], [0.03, 0.03, 0.02]),
      ] },
      { name: 'tail', at: [-0.2, 0.07, 0], tint: true, prims: [
        p('cone', '#ffffff', [-0.25, 0, 0], [0.1, 0.5, 0.08], [0, 0, HALF]),
      ] },
      ...['FL', 'FR', 'BL', 'BR'].map((k) => {
        const x = k[0] === 'F' ? 0.14 : -0.14;
        const s = k[1] === 'L' ? 1 : -1;
        return { name: 'leg' + k, at: [x, 0.06, 0.07 * s], tint: true, prims: [
          p('box', '#ffffff', [0, -0.02, 0.07 * s], [0.04, 0.04, 0.14], [0.4 * s, 0, 0]),
          p('box', '#ffffff', [0.02, -0.06, 0.13 * s], [0.07, 0.02, 0.05]),
        ] };
      }),
    ],
    pose(a, P, t) {
      const sw = Math.sin(a.phase) * a.gait * 0.7;
      P.legFL.ry = sw; P.legBR.ry = sw;
      P.legFR.ry = sw; P.legBL.ry = sw;
      P.body.ry = -sw * 0.25;
      P.tail.ry = sw * 0.8 + Math.sin(t * 2 + a.seed) * 0.15;
      P.head.ry = sw * 0.3 + a.look;
      // push-ups when idle
      const pu = a.gait < 0.2 ? Math.max(0, Math.sin(a.t * 5)) * 0.05 * (a.pushups || 0) : 0;
      P.body.oy = pu; P.head.oy = pu * 1.4; P.head.rz = pu * 2;
    },
  },

  dog: {
    bones: quad({
      len: 0.85, bh: 0.34, bw: 0.3, leg: 0.42, lw: 0.11, fur: '#ffffff', nw: 0.2,
      headFwd: 0.08, headUp: 0.33, hs: 0.3, snout: 0.18, snoutColor: '#e8dcc8', foot: '#f0e8dc',
      tail: [0.32, 0.8, 0.07],
      headExtra: [
        p('box', '#6a4a30', [-0.02, 0.1, 0.16], [0.1, 0.24, 0.05], [0.25, 0, -0.2]),
        p('box', '#6a4a30', [-0.02, 0.1, -0.16], [0.1, 0.24, 0.05], [-0.25, 0, -0.2]),
        p('box', '#ff6f8a', [0.3, -0.2, 0.04], [0.07, 0.12, 0.07]),
      ],
      bodyExtra: [p('box', '#e03a3a', [0.3, 0.08, 0], [0.06, 0.24, 0.32])],
    }),
    pose(a, P) { quadPose(a, P, { stride: 0.9, wag: 0.7, wagSpeed: 16, sitPitch: 0.42 }); },
  },

  cat: {
    bones: quad({
      len: 0.62, bh: 0.22, bw: 0.2, leg: 0.3, lw: 0.07, fur: '#ffffff', nw: 0.13,
      headFwd: 0.03, headUp: 0.18, hs: 0.24, snout: 0.05, foot: '#ffffff', nose: '#e88',
      tail: [0.42, 1.1, 0.05],
      tailExtra: [p('box', '#ffffff', [-0.28, 0.42, 0], [0.16, 0.05, 0.05], [0, 0, 0.6])],
      glowEyes: '#d8ff3a',
      headExtra: [
        p('cone', '#ffffff', [0.0, 0.16, 0.08], [0.08, 0.14, 0.06]),
        p('cone', '#ffffff', [0.0, 0.16, -0.08], [0.08, 0.14, 0.06]),
      ],
    }),
    pose(a, P, t) {
      quadPose(a, P, { stride: 0.8, wag: 0.25, wagSpeed: 2, sitPitch: 0.42 });
      P.tail.ry = Math.sin(t * 1.7 + a.seed) * 0.5;
      P.tail.rz = a.gait > 0.5 ? -0.5 : 0;
      copyBone(P, 'head', 'eyes');
      P.eyes.s = a.blink ? 0.05 : 1;
    },
  },

  goat: {
    bones: quad({
      len: 0.8, bh: 0.36, bw: 0.3, leg: 0.46, lw: 0.1, fur: '#f4f0e6', nw: 0.18,
      headFwd: 0.1, headUp: 0.36, hs: 0.26, snout: 0.14, foot: '#2a2420', snoutColor: '#e6e0d4',
      tail: [0.12, 1.1, 0.06],
      headExtra: [
        p('cone', '#3a3530', [-0.08, 0.2, 0.07], [0.06, 0.26, 0.06], [0, 0, 0.7]),
        p('cone', '#3a3530', [-0.08, 0.2, -0.07], [0.06, 0.26, 0.06], [0, 0, 0.7]),
        p('box', '#e6e0d4', [0.18, -0.22, 0], [0.06, 0.14, 0.06]),
        p('box', '#e6e0d4', [0, 0.02, 0.15], [0.12, 0.05, 0.1]),
        p('box', '#e6e0d4', [0, 0.02, -0.15], [0.12, 0.05, 0.1]),
      ],
      bodyExtra: [p('box', '#fbf8f2', [0.05, 0.12, 0], [0.7, 0.16, 0.32])],
    }),
    pose(a, P) {
      quadPose(a, P, { stride: 0.8, wag: 0.3, graze: 1.2 });
      if (a.air > 0.5) { P.legFL.rz = P.legFR.rz = 0.9; P.legBL.rz = P.legBR.rz = -0.9; }
    },
  },

  camel: {
    bones: quad({
      len: 1.1, bh: 0.46, bw: 0.42, leg: 1.0, lw: 0.13, fur: '#c99658', nw: 0.18,
      headFwd: 0.42, headUp: 0.62, hs: 0.26, snout: 0.22, foot: '#a07040', snoutColor: '#b8844c',
      tail: [0.3, -1.2, 0.05],
      bodyExtra: [
        p('ball', '#c08a4c', [-0.05, 0.3, 0], [0.62, 0.5, 0.4]),
        p('box', '#b87c40', [0.02, 0.62, 0], [0.4, 0.06, 0.5]),
        p('box', '#d8402a', [0.02, 0.5, 0.22], [0.36, 0.3, 0.03]),
        p('box', '#d8402a', [0.02, 0.5, -0.22], [0.36, 0.3, 0.03]),
      ],
      headExtra: [
        p('box', '#a87840', [-0.08, 0.14, 0.1], [0.05, 0.08, 0.05]),
        p('box', '#a87840', [-0.08, 0.14, -0.1], [0.05, 0.08, 0.05]),
      ],
    }),
    pose(a, P) {
      // camels pace: same-side legs together
      const sw = Math.sin(a.phase) * a.gait * 0.45;
      quadPose(a, P, { stride: 0.45, wag: 0.2, graze: 0.5 });
      P.legFL.rz = sw; P.legBL.rz = sw; P.legFR.rz = -sw; P.legBR.rz = -sw;
      P.head.oy += Math.sin(a.phase * 2) * 0.05 * a.gait;
    },
  },

  penguin: {
    bones: [
      { name: 'body', at: [0, 0.42, 0], prims: [
        p('ball', '#1c1f2a', [0, 0, 0], [0.42, 0.66, 0.44]),
        p('ball', '#f7f7f2', [0.07, -0.03, 0], [0.32, 0.54, 0.36]),
      ] },
      { name: 'head', at: [0, 0.78, 0], prims: [
        p('ball', '#1c1f2a', [0, 0.02, 0], [0.3, 0.28, 0.3]),
        p('box', '#f7f7f2', [0.1, 0.0, 0.09], [0.06, 0.08, 0.08]),
        p('box', '#f7f7f2', [0.1, 0.0, -0.09], [0.06, 0.08, 0.08]),
        p('box', EYE, [0.13, 0.01, 0.09], [0.03, 0.04, 0.04]),
        p('box', EYE, [0.13, 0.01, -0.09], [0.03, 0.04, 0.04]),
        p('cone', '#ff9a1a', [0.2, -0.03, 0], [0.07, 0.14, 0.06], [0, 0, -HALF]),
      ] },
      { name: 'flipL', at: [0, 0.58, 0.2], prims: [p('box', '#1c1f2a', [0, -0.14, 0.02], [0.1, 0.32, 0.04], [0.15, 0, 0])] },
      { name: 'flipR', at: [0, 0.58, -0.2], prims: [p('box', '#1c1f2a', [0, -0.14, -0.02], [0.1, 0.32, 0.04], [-0.15, 0, 0])] },
      { name: 'feet', at: [0, 0.05, 0], prims: [
        p('box', '#ff9a1a', [0.08, -0.025, 0.09], [0.16, 0.05, 0.1]),
        p('box', '#ff9a1a', [0.08, -0.025, -0.09], [0.16, 0.05, 0.1]),
      ] },
    ],
    pose(a, P) {
      const w = Math.sin(a.phase) * a.gait;
      P.flipL.rx = -0.2 - Math.abs(w) * 0.5 - (a.slide || 0) * 1.2;
      P.flipR.rx = 0.2 + Math.abs(w) * 0.5 + (a.slide || 0) * 1.2;
      P.head.ry = a.look;
      P.head.rz = (a.slide || 0) * 0.9;
      P.feet.oz = 0;
      P.feet.ry = w * 0.3;
    },
  },

  rabbit: {
    bones: [
      { name: 'body', at: [0, 0.3, 0], tint: true, prims: [
        p('ball', '#ffffff', [0, 0, 0], [0.46, 0.36, 0.32]),
        p('ball', '#ffffff', [-0.24, 0.06, 0], [0.12, 0.12, 0.12]),
      ] },
      { name: 'head', at: [0.2, 0.46, 0], tint: true, prims: [
        p('ball', '#ffffff', [0.05, 0, 0], [0.24, 0.21, 0.2]),
        p('box', '#ffffff', [-0.04, 0.2, 0.05], [0.07, 0.3, 0.045], [0.12, 0, 0.25]),
        p('box', '#ffffff', [-0.04, 0.2, -0.05], [0.07, 0.3, 0.045], [-0.12, 0, 0.25]),
        p('box', '#ffb0c0', [-0.035, 0.2, 0.074], [0.035, 0.22, 0.01], [0.12, 0, 0.25]),
        p('box', '#ffb0c0', [-0.035, 0.2, -0.074], [0.035, 0.22, 0.01], [-0.12, 0, 0.25]),
        p('box', EYE, [0.1, 0.03, 0.085], [0.04, 0.04, 0.02]),
        p('box', EYE, [0.1, 0.03, -0.085], [0.04, 0.04, 0.02]),
        p('box', '#ff8fa0', [0.17, -0.02, 0], [0.03, 0.03, 0.04]),
      ] },
      { name: 'legB', at: [-0.1, 0.2, 0], tint: true, prims: [
        p('ball', '#ffffff', [0, 0, 0.13], [0.2, 0.2, 0.1]),
        p('ball', '#ffffff', [0, 0, -0.13], [0.2, 0.2, 0.1]),
        p('box', '#ffffff', [0.06, -0.17, 0.13], [0.26, 0.06, 0.08]),
        p('box', '#ffffff', [0.06, -0.17, -0.13], [0.26, 0.06, 0.08]),
      ] },
      { name: 'legF', at: [0.14, 0.2, 0], tint: true, prims: [
        p('box', '#ffffff', [0, -0.1, 0.07], [0.06, 0.2, 0.06]),
        p('box', '#ffffff', [0, -0.1, -0.07], [0.06, 0.2, 0.06]),
      ] },
    ],
    pose(a, P, t) {
      const k = a.air > 0.5 ? 1 : 0;
      P.legB.rz = k * 0.9;
      P.legB.ox = -k * 0.08;
      P.legF.rz = -k * 0.9;
      P.head.rz = -a.peck * 0.6;
      P.head.ry = a.look;
      P.head.oy = Math.sin(t * 9 + a.seed) * 0.005; // nose twitch
    },
  },

  frog: {
    bones: [
      { name: 'body', at: [0, 0.16, 0], tint: true, prims: [
        p('ball', '#ffffff', [0, 0, 0], [0.42, 0.24, 0.36]),
        p('ball', '#f0f0c0', [0.04, -0.06, 0], [0.34, 0.14, 0.3]),
        p('ball', '#ffffff', [0.12, 0.11, 0.1], [0.12, 0.12, 0.12]),
        p('ball', '#ffffff', [0.12, 0.11, -0.1], [0.12, 0.12, 0.12]),
        p('ball', '#f8f8f0', [0.15, 0.13, 0.12], [0.07, 0.08, 0.07]),
        p('ball', '#f8f8f0', [0.15, 0.13, -0.12], [0.07, 0.08, 0.07]),
        p('box', EYE, [0.185, 0.135, 0.13], [0.02, 0.05, 0.04]),
        p('box', EYE, [0.185, 0.135, -0.13], [0.02, 0.05, 0.04]),
        p('box', '#5a2a2a', [0.2, 0.0, 0], [0.02, 0.015, 0.2]),
      ] },
      { name: 'legB', at: [-0.12, 0.12, 0], tint: true, prims: [
        p('ball', '#ffffff', [0, 0, 0.17], [0.22, 0.12, 0.1]),
        p('ball', '#ffffff', [0, 0, -0.17], [0.22, 0.12, 0.1]),
        p('box', '#ffffff', [0.08, -0.1, 0.21], [0.2, 0.03, 0.1]),
        p('box', '#ffffff', [0.08, -0.1, -0.21], [0.2, 0.03, 0.1]),
      ] },
      { name: 'legF', at: [0.12, 0.1, 0], tint: true, prims: [
        p('box', '#ffffff', [0.02, -0.05, 0.12], [0.05, 0.12, 0.05]),
        p('box', '#ffffff', [0.02, -0.05, -0.12], [0.05, 0.12, 0.05]),
      ] },
    ],
    pose(a, P, t) {
      const k = a.air > 0.5 ? 1 : 0;
      P.legB.rz = k * 1.1;
      P.legB.ox = -k * 0.12;
      P.legB.oy = -k * 0.04;
      P.legF.rz = -k * 0.7;
      P.body.sy = 1 + (1 - k) * Math.max(0, Math.sin(t * 6 + a.seed)) * 0.08; // throat pulse
    },
  },

  monkey: {
    bones: [
      { name: 'body', at: [0, 0.55, 0], prims: [
        p('ball', '#9a6034', [0, 0, 0], [0.32, 0.44, 0.28]),
        p('ball', '#f0c89a', [0.06, -0.02, 0], [0.2, 0.3, 0.22]),
      ] },
      { name: 'head', at: [0.02, 0.88, 0], prims: [
        p('ball', '#9a6034', [0, 0, 0], [0.3, 0.28, 0.28]),
        p('ball', '#f4d0a4', [0.1, -0.03, 0], [0.16, 0.2, 0.22]),
        p('ball', '#f4d0a4', [0, 0.01, 0.16], [0.1, 0.12, 0.06]),
        p('ball', '#f4d0a4', [0, 0.01, -0.16], [0.1, 0.12, 0.06]),
        p('box', EYE, [0.17, 0.03, 0.05], [0.03, 0.04, 0.03]),
        p('box', EYE, [0.17, 0.03, -0.05], [0.03, 0.04, 0.03]),
        p('box', '#6a3a2a', [0.18, -0.07, 0], [0.02, 0.02, 0.08]),
      ] },
      { name: 'armL', at: [0.02, 0.7, 0.17], prims: [
        p('box', '#9a6034', [0, -0.2, 0], [0.08, 0.42, 0.08]),
        p('box', '#f0c89a', [0.02, -0.42, 0], [0.08, 0.06, 0.08]),
      ] },
      { name: 'armR', at: [0.02, 0.7, -0.17], prims: [
        p('box', '#9a6034', [0, -0.2, 0], [0.08, 0.42, 0.08]),
        p('box', '#f0c89a', [0.02, -0.42, 0], [0.08, 0.06, 0.08]),
      ] },
      { name: 'legL', at: [-0.02, 0.36, 0.09], prims: [
        p('box', '#9a6034', [0, -0.17, 0], [0.09, 0.36, 0.09]),
        p('box', '#f0c89a', [0.04, -0.34, 0], [0.14, 0.04, 0.08]),
      ] },
      { name: 'legR', at: [-0.02, 0.36, -0.09], prims: [
        p('box', '#9a6034', [0, -0.17, 0], [0.09, 0.36, 0.09]),
        p('box', '#f0c89a', [0.04, -0.34, 0], [0.14, 0.04, 0.08]),
      ] },
      { name: 'tail', at: [-0.14, 0.4, 0], prims: [
        p('box', '#9a6034', [-0.16, 0.04, 0], [0.34, 0.05, 0.05], [0, 0, 0.2]),
        p('box', '#9a6034', [-0.34, 0.2, 0], [0.05, 0.3, 0.05], [0, 0, 0.3]),
        p('box', '#9a6034', [-0.26, 0.36, 0], [0.16, 0.05, 0.05], [0, 0, -0.4]),
      ] },
    ],
    pose(a, P, t) {
      const sw = Math.sin(a.phase) * a.gait;
      if (a.air > 0.5) {
        // arms up, legs tucked: a swinging leap
        P.armL.rz = 2.8 + Math.sin(t * 10) * 0.2;
        P.armR.rz = 2.6 - Math.sin(t * 10) * 0.2;
        P.legL.rz = P.legR.rz = 0.9;
      } else {
        P.armL.rz = sw * 0.8 + (a.scratch ? 2.4 + Math.sin(t * 14) * 0.25 : 0);
        P.armR.rz = -sw * 0.8;
        P.legL.rz = -sw * 0.8;
        P.legR.rz = sw * 0.8;
      }
      P.tail.rz = Math.sin(t * 2 + a.seed) * 0.25;
      P.head.ry = a.look;
      P.head.rz = a.scratch ? -0.2 : 0;
    },
  },

  butterfly: {
    bones: [
      { name: 'body', at: [0, 0, 0], prims: [
        p('box', '#2a2020', [0, 0, 0], [0.26, 0.04, 0.04]),
        p('box', '#2a2020', [0.16, 0.06, 0.03], [0.1, 0.01, 0.01], [0, 0, 0.8]),
        p('box', '#2a2020', [0.16, 0.06, -0.03], [0.1, 0.01, 0.01], [0, 0, 0.8]),
      ] },
      { name: 'wingL', at: [0, 0.01, 0.02], tint: true, prims: [
        p('box', '#ffffff', [0.05, 0, 0.17], [0.2, 0.012, 0.32], [0, 0.2, 0]),
        p('box', '#ffffff', [-0.08, 0, 0.12], [0.15, 0.012, 0.2], [0, -0.3, 0]),
        p('box', '#222222', [0.1, 0.004, 0.3], [0.08, 0.012, 0.06]),
      ] },
      { name: 'wingR', at: [0, 0.01, -0.02], tint: true, prims: mirror([
        p('box', '#ffffff', [0.05, 0, 0.17], [0.2, 0.012, 0.32], [0, 0.2, 0]),
        p('box', '#ffffff', [-0.08, 0, 0.12], [0.15, 0.012, 0.2], [0, -0.3, 0]),
        p('box', '#222222', [0.1, 0.004, 0.3], [0.08, 0.012, 0.06]),
      ]) },
    ],
    pose(a, P) {
      const f = (Math.sin(a.flap) * 0.5 + 0.5) * 1.35;
      P.wingL.rx = -f;
      P.wingR.rx = f;
    },
  },

  bat: {
    bones: [
      { name: 'body', at: [0, 0, 0], prims: [
        p('ball', '#3a2c4a', [0, 0, 0], [0.22, 0.16, 0.16]),
        p('ball', '#3a2c4a', [0.12, 0.03, 0], [0.12, 0.12, 0.12]),
        p('cone', '#3a2c4a', [0.12, 0.1, 0.04], [0.05, 0.1, 0.04]),
        p('cone', '#3a2c4a', [0.12, 0.1, -0.04], [0.05, 0.1, 0.04]),
      ] },
      { name: 'eyes', at: [0, 0, 0], glow: true, prims: [
        p('box', '#ff3a6a', [0.18, 0.05, 0.03], [0.02, 0.025, 0.025]),
        p('box', '#ff3a6a', [0.18, 0.05, -0.03], [0.02, 0.025, 0.025]),
      ] },
      { name: 'wingL', at: [0.02, 0.02, 0.06], prims: [
        p('box', '#4a3060', [0, 0, 0.2], [0.2, 0.015, 0.4]),
        p('box', '#4a3060', [-0.06, 0, 0.38], [0.2, 0.012, 0.14], [0, -0.5, 0]),
        p('box', '#231a30', [0.08, 0.004, 0.22], [0.02, 0.02, 0.42]),
      ] },
      { name: 'wingR', at: [0.02, 0.02, -0.06], prims: mirror([
        p('box', '#4a3060', [0, 0, 0.2], [0.2, 0.015, 0.4]),
        p('box', '#4a3060', [-0.06, 0, 0.38], [0.2, 0.012, 0.14], [0, -0.5, 0]),
        p('box', '#231a30', [0.08, 0.004, 0.22], [0.02, 0.02, 0.42]),
      ]) },
    ],
    pose(a, P) {
      const f = Math.sin(a.flap) * 1.1;
      P.wingL.rx = -f;
      P.wingR.rx = f;
    },
  },

  drone: {
    bones: [
      { name: 'body', at: [0, 0, 0], prims: [
        p('box', '#eef0f5', [0, 0, 0], [0.44, 0.14, 0.34]),
        p('box', '#ff8a1a', [0, 0.09, 0], [0.3, 0.06, 0.22]),
        p('box', '#9aa0b0', [0, 0, 0], [0.95, 0.05, 0.06], [0, PI / 4, 0]),
        p('box', '#9aa0b0', [0, 0, 0], [0.95, 0.05, 0.06], [0, -PI / 4, 0]),
        ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => p('cyl', '#1a1c22', [0.33 * x, 0.05, 0.33 * z], [0.08, 0.1, 0.08])),
        p('box', '#15161a', [0.14, -0.14, 0], [0.16, 0.14, 0.16]),
        p('box', '#3a3e4a', [0.1, -0.06, 0], [0.04, 0.08, 0.04]),
      ] },
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z], i) => ({
        name: 'rotor' + i, at: [0.33 * x, 0.11, 0.33 * z], prims: [
          p('box', '#c8ccd8', [0, 0, 0], [0.46, 0.012, 0.05]),
          p('box', '#c8ccd8', [0, 0, 0], [0.05, 0.012, 0.46]),
        ],
      })),
      { name: 'lens', at: [0, 0, 0], glow: true, prims: [
        p('box', '#40e0ff', [0.225, -0.14, 0], [0.01, 0.08, 0.08]),
        p('box', '#40e0ff', [0, -0.075, 0], [0.34, 0.012, 0.24]),
      ] },
      { name: 'ledA', at: [0, 0, 0], glow: true, prims: [
        p('box', '#ff2040', [-0.33, 0.0, 0.33], [0.07, 0.07, 0.07]),
        p('box', '#ff2040', [-0.33, 0.0, -0.33], [0.07, 0.07, 0.07]),
      ] },
      { name: 'ledB', at: [0, 0, 0], glow: true, prims: [
        p('box', '#20ff80', [0.33, 0.0, 0.33], [0.07, 0.07, 0.07]),
        p('box', '#20ff80', [0.33, 0.0, -0.33], [0.07, 0.07, 0.07]),
      ] },
    ],
    pose(a, P, t) {
      for (let i = 0; i < 4; i++) P['rotor' + i].ry = t * (i % 2 ? 41 : -43) + i;
      const blink = (t * 2 + a.seed) % 1;
      P.ledA.s = blink < 0.15 ? 1.4 : 0.001;
      P.ledB.s = blink > 0.5 && blink < 0.65 ? 1.4 : 0.001;
    },
  },
};

// Rocks animals perch on (lizards, goats).
export function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(1, 0);
  g.scale(1, 0.6, 0.85);
  g.translate(0, 0.3, 0);
  g.computeVertexNormals();
  return g;
}
