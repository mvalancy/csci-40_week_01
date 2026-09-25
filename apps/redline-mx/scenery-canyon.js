// Scorpion Canyon: stratified sandstone mesas and buttes, rock arches,
// saguaros, a rickety water tower, bleached skulls and rolling tumbleweeds.
import * as THREE from 'three';
import { T, X0, X1, mergeParts } from './scenery-kit.js';

const BANDS = ['#b4502a', '#d0703a', '#e39a5c', '#c45e33', '#f0b27a', '#a8472a', '#d98548', '#e8a86a'];

// An irregular flat-topped rock column with colour strata by height.
function rockColumn(rng, { r = 10, h = 30, segs = 9, rings = 7, taper = 0.25, rough = 0.18, cap = true }) {
  const geo = new THREE.CylinderGeometry(r * (1 - taper), r, h, segs, rings, !cap);
  const pos = geo.attributes.position;
  const radial = Array.from({ length: segs + 1 }, () => 1 + (rng() - 0.5) * rough * 2);
  radial[segs] = radial[0];
  const ringJit = Array.from({ length: rings + 1 }, () => 1 + (rng() - 0.5) * rough);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x);
    const a = Math.round(((ang / (Math.PI * 2) + 1) % 1) * segs);
    const ring = Math.round((0.5 - v.y / h) * rings);
    const k = Math.hypot(v.x, v.z) < 1e-4 ? 1 : radial[a % segs] * ringJit[Math.min(rings, Math.max(0, ring))];
    pos.setXYZ(i, v.x * k, v.y + h / 2, v.z * k);
  }
  return geo;
}

function strata(rng, bandH, baseY = 0, hazeFn = (c) => new THREE.Color(c)) {
  const offs = Math.floor(rng() * BANDS.length);
  const cache = new Map();
  return (v) => {
    const band = Math.floor((v.y - baseY) / bandH + 100) + offs;
    if (!cache.has(band)) cache.set(band, hazeFn(BANDS[band % BANDS.length]));
    return cache.get(band);
  };
}

export function buildCanyon(ctx, kit) {
  const rng = ctx.rng;
  const lit = kit.batch(kit.mats.lit(), { chunk: 140 });
  const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
  const far = kit.batch(farMat, { chunk: 320 });

  // ---- far mesa silhouettes (fog-free, pre-hazed) ----
  for (let x = X0 - 250; x < X1 + 250; x += 60 + rng() * 70) {
    const z = -230 - rng() * 60;
    const h = 30 + rng() * 55;
    const r = 25 + rng() * 45;
    far.add(rockColumn(rng, { r, h, segs: 8, rings: 3, taper: 0.12, rough: 0.12 }).translate(x, -3, z), strata(rng, h / 5, -3, (c) => kit.haze(c, 0.62)));
  }
  // ---- mid layer mesas + buttes ----
  for (let x = X0 - 150; x < X1 + 150; x += 35 + rng() * 55) {
    const z = -80 - rng() * 70;
    const kz = (-z - 60) / 200;
    const tall = rng() < 0.3;
    const h = tall ? 35 + rng() * 30 : 18 + rng() * 26;
    const r = tall ? 5 + rng() * 5 : 14 + rng() * 22;
    const geo = rockColumn(rng, { r, h, segs: tall ? 7 : 10, rings: tall ? 8 : 5, taper: tall ? 0.3 : 0.14, rough: 0.16 });
    // talus skirt at the base
    far.add(geo.translate(x, -1, z), strata(rng, 3.2 + rng() * 2, -1, (c) => kit.haze(c, kz * 0.9)));
    far.add(T(new THREE.ConeGeometry(r * 1.6, h * 0.3, 10, 1, true), { x, y: h * 0.15 - 1, z, ry: rng() * 3 }), kit.haze('#c9814b', kz * 0.9 + 0.05));
  }
  // ---- near buttes and hoodoos (in fog, lit) ----
  for (let x = X0; x < X1; x += 40 + rng() * 70) {
    const z = -24 - rng() * 30;
    const h = 8 + rng() * 16;
    const r = 2.5 + rng() * 4;
    lit.add(rockColumn(rng, { r, h, segs: 7, rings: 6, taper: 0.35, rough: 0.25 }).translate(x, -0.5, z), strata(rng, 1.4 + rng()));
    // cap rock
    if (rng() < 0.6) lit.add(T(new THREE.CylinderGeometry(r * 0.9, r * 0.75, 1.4, 7), { x, y: h - 0.3, z, ry: rng() * 3 }), '#7a3a22');
    // boulders around the foot
    for (let i = 0; i < 3; i++) {
      lit.add(T(new THREE.DodecahedronGeometry(0.8 + rng() * 1.6, 0), { x: x + (rng() - 0.5) * r * 4, y: 0.3, z: z + (rng() - 0.5) * r * 2 + r, s: 1, sy: 0.7, ry: rng() * 3 }), '#b8683c');
    }
  }
  // ---- rock arches ----
  for (let x = 60 + rng() * 80; x < X1; x += 220 + rng() * 160) {
    const z = -40 - rng() * 30;
    const R = 9 + rng() * 6;
    const t = 2.2 + rng() * 1.5;
    const arch = new THREE.TorusGeometry(R, t, 6, 14, Math.PI);
    const pos = arch.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * 1.6 + (rng() - 0.5) * 0.6);
    lit.add(T(arch, { x, y: 0, z, sy: 1.25 }), strata(rng, 1.8));
    // feet
    for (const s of [-1, 1]) lit.add(rockColumn(rng, { r: t * 1.8, h: 5, segs: 7, rings: 2, taper: 0.3 }).translate(x + s * R, -0.5, z), strata(rng, 1.8));
  }

  // ---- ground: sandy dunes behind the track ----
  for (let x = X0; x < X1; x += 18 + rng() * 22) {
    lit.add(T(new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), { x, y: -0.2, z: -14 - rng() * 60, sx: 8 + rng() * 14, sy: 1 + rng() * 2.5, sz: 5 + rng() * 6 }), rng() < 0.5 ? '#e0a86c' : '#d49a5e');
  }

  // ---- saguaros (instanced, merged arms) ----
  const cParts = [T(new THREE.CylinderGeometry(0.34, 0.4, 5, 8), { y: 2.5 }), T(new THREE.SphereGeometry(0.34, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), { y: 5 })];
  for (const [s, y0, h] of [[1, 1.8, 1.8], [-1, 2.6, 1.3]]) {
    cParts.push(T(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 7), { x: s * 0.6, y: y0, rz: s * Math.PI / 2 }));
    cParts.push(T(new THREE.CylinderGeometry(0.22, 0.24, h, 7), { x: s * 1.05, y: y0 + h / 2 - 0.1 }));
    cParts.push(T(new THREE.SphereGeometry(0.22, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), { x: s * 1.05, y: y0 + h - 0.1 }));
  }
  const cGeo = kit.own(mergeParts(cParts));
  const cacti = [];
  for (let x = X0; x < X1; x += 5 + rng() * 14) {
    const z = -9 - rng() * rng() * 70;
    cacti.push({ x, y: -0.1, z, s: 0.8 + rng() * 0.9, ry: rng() * 6 });
  }
  for (let x = 30; x < X1; x += 120 + rng() * 120) cacti.push({ x, y: -0.1, z: 10 + rng() * 2, s: 0.45 + rng() * 0.2, ry: rng() * 6 });
  kit.instanced(cGeo, new THREE.MeshLambertMaterial({ flatShading: true }), cacti, {
    colors: () => ['#6f9a42', '#58803a', '#7fa84e'][Math.floor(rng() * 3)],
  });

  // ---- water towers ----
  for (let x = 130 + rng() * 100; x < X1; x += 360 + rng() * 200) {
    const z = -20 - rng() * 8;
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      lit.add(T(new THREE.BoxGeometry(0.3, 10, 0.3), { x: x + dx, y: 5, z: z + dz, rz: -dx * 0.03, rx: dz * 0.03 }), '#6a4a30');
    }
    for (const y of [3, 6.5]) {
      lit.add(T(new THREE.BoxGeometry(4.4, 0.18, 0.18), { x, y, z: z + 1.6, rz: 0.5 }), '#6a4a30');
      lit.add(T(new THREE.BoxGeometry(4.4, 0.18, 0.18), { x, y, z: z + 1.6, rz: -0.5 }), '#6a4a30');
    }
    lit.add(T(new THREE.CylinderGeometry(3, 3, 4.2, 14), { x, y: 12, z }), (v) => new THREE.Color(Math.floor(v.x * 2) % 2 ? '#8a5a36' : '#7b4e2e'));
    lit.add(T(new THREE.ConeGeometry(3.4, 1.8, 14), { x, y: 15, z }), '#5a4a42');
    lit.add(T(new THREE.BoxGeometry(6.4, 0.25, 6.4), { x, y: 9.9, z }), '#5a3a22');
    lit.add(T(new THREE.CylinderGeometry(0.15, 0.15, 10, 5), { x: x + 2.8, y: 5, z: z + 2.4 }), '#555');
  }

  // ---- skulls and bones ----
  const skullGeo = (() => {
    const parts = [
      T(new THREE.BoxGeometry(0.7, 0.45, 0.9), { y: 0.25 }),
      T(new THREE.BoxGeometry(0.4, 0.3, 0.7), { y: 0.15, z: 0.6 }),
      T(new THREE.ConeGeometry(0.1, 1.1, 5), { x: 0.75, y: 0.5, rz: -1.2 }),
      T(new THREE.ConeGeometry(0.1, 1.1, 5), { x: -0.75, y: 0.5, rz: 1.2 }),
      T(new THREE.BoxGeometry(0.16, 0.12, 0.05), { x: 0.2, y: 0.32, z: 0.46 }),
    ];
    return mergeParts(parts);
  })();
  kit.own(skullGeo);
  const skulls = [];
  for (let x = 20; x < X1; x += 70 + rng() * 90) skulls.push({ x, y: 0, z: -9 - rng() * 6, ry: rng() * 6, s: 1 + rng() * 0.4 });
  for (let x = 80; x < X1; x += 250 + rng() * 150) skulls.push({ x, y: 0, z: 9.5 + rng() * 1.5, ry: rng() * 6, s: 0.9 });
  kit.instanced(skullGeo, new THREE.MeshLambertMaterial({ color: '#f1e8d6', flatShading: true }), skulls);

  // ---- tumbleweeds rolling across the backdrop ----
  const twGeo = kit.own(new THREE.IcosahedronGeometry(0.7, 1));
  const twMat = new THREE.MeshLambertMaterial({ color: '#a07a44', wireframe: true });
  const N = 14;
  const tw = new THREE.InstancedMesh(twGeo, twMat, N);
  tw.frustumCulled = false;
  kit.add(tw);
  // also a solid inner core so they read at distance
  const coreGeo = kit.own(new THREE.IcosahedronGeometry(0.45, 0));
  const core = new THREE.InstancedMesh(coreGeo, new THREE.MeshLambertMaterial({ color: '#7a5a30', transparent: true, opacity: 0.55 }), N);
  core.frustumCulled = false;
  kit.add(core);
  const weeds = Array.from({ length: N }, (_, i) => ({
    x: 20 + i * 9, z: -9 - rng() * 10, v: 4 + rng() * 5, spin: 0, bounce: rng() * 6, s: 0.6 + rng() * 0.6,
  }));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();

  return {
    update(dt, time, focus) {
      const fx = focus.x;
      for (let i = 0; i < N; i++) {
        const w = weeds[i];
        w.x += w.v * dt;
        w.spin -= (w.v / (0.7 * w.s)) * dt;
        w.bounce += dt * (3 + w.v * 0.4);
        if (w.x > fx + 60) { w.x = fx - 30 - rng() * 20; w.z = -9 - rng() * 12; }
        if (w.x < fx - 60) { w.x = fx + 20 + rng() * 40; }
        const y = 0.7 * w.s + Math.abs(Math.sin(w.bounce)) * 0.8;
        e.set(0.3, 0, w.spin);
        q.setFromEuler(e);
        p.set(w.x, y, w.z);
        sc.setScalar(w.s);
        m4.compose(p, q, sc);
        tw.setMatrixAt(i, m4);
        core.setMatrixAt(i, m4);
      }
      tw.instanceMatrix.needsUpdate = true;
      core.instanceMatrix.needsUpdate = true;
    },
  };
}

