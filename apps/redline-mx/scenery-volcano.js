// Magma Jungle: a huge smoking volcano with a glowing crater and lava flows,
// a glowing lava river, jungle palms, ferns and broadleaf bushes, stone idol
// heads with ember eyes and flickering tiki torches.
import * as THREE from 'three';
import { T, X0, X1, canvasTexture, mergeColored } from './scenery-kit.js';

const BASALT = ['#2a1f1c', '#3a2a24', '#32241f'];
const LAVA = ['#ffdd55', '#ff9a1a', '#ff5a1f', '#e0301a'];

function volcanoGeo(rng, R, H, crater) {
  // open-topped cone with jittered rings; vertex y 0..H
  const geo = new THREE.CylinderGeometry(crater, R, H, 18, 6, true);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    if (!seen.has(key)) {
      const t = (v.y + H / 2) / H;
      // concave profile: pull mid rings inward
      const k = 1 - Math.sin(t * Math.PI) * 0.18 + (rng() - 0.5) * 0.08;
      seen.set(key, [k, (rng() - 0.5) * H * 0.03 * (t < 0.99 ? 1 : 0.3)]);
    }
    const [k, dy] = seen.get(key);
    pos.setXYZ(i, v.x * k, v.y + H / 2 + dy, v.z * k);
  }
  return geo;
}

// A lava ribbon that runs down a cone of radius R (base) / c (top), height H.
function lavaFlow(rng, R, H, c, ang, width, reach) {
  const pts = [];
  let a = ang;
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * reach; // 0 top .. reach (1 = base)
    const y = H * (1 - t);
    const prof = 1 - Math.sin((1 - t) * Math.PI) * 0.18;
    const r = (c + (R - c) * t) * (prof + 0.07) + 1;
    a += (rng() - 0.5) * 0.08;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r, width * (0.5 + t * 0.9)]);
  }
  const pos = [];
  const idx = [];
  pts.forEach(([x, y, z, w], i) => {
    const tx = -Math.sin(a); const tz = Math.cos(a);
    pos.push(x - tx * w, y, z - tz * w, x + tx * w, y, z + tz * w);
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildVolcano(ctx, kit) {
  const rng = ctx.rng;
  const lit = kit.batch(kit.mats.lit(), { chunk: 140 });
  const far = kit.batch(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }), { chunk: 360 });
  const glow = kit.batch(kit.mats.glow(), { chunk: 160 });
  const glowFar = kit.batch(kit.mats.glow({ fog: false, side: THREE.DoubleSide }), { chunk: 360 });

  // ---- the great volcano: a parallax group so it stays on the horizon ----
  const big = new THREE.Group();
  const bigLit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
  const bigGlow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const R = 150; const H = 72; const C = 20;
  const vg = volcanoGeo(rng, R, H, C);
  const bigGeo = new THREE.Mesh(kit.own(colorize(vg, (v) => {
    const t = v.y / H;
    const base = new THREE.Color(BASALT[Math.floor(Math.abs(v.x * 13 + v.z * 7)) % 3]);
    // warm glow near the rim, hazier at the base
    return kit.haze(base.lerp(new THREE.Color('#7a2a12'), Math.max(0, t - 0.75) * 2.5), 0.45 * (1 - t) + 0.12);
  })), bigLit);
  big.add(bigGeo);
  const flows = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.5 + (rng() - 0.5) * 2.2; // mostly on the side facing the camera (+z)
    flows.push(lavaFlow(rng, R, H, C, a, 2.5 + rng() * 3, 0.45 + rng() * 0.5));
  }
  const flowGeo = kit.own(colorizeMany(flows, (v) => {
    const t = v.y / H;
    return new THREE.Color(LAVA[Math.min(3, Math.floor((1 - t) * 4))]).multiplyScalar(0.8 + t * 0.4);
  }));
  big.add(new THREE.Mesh(flowGeo, bigGlow));
  // crater glow: a lava disc just inside the rim + additive glow sprite
  const crater = new THREE.Mesh(kit.own(new THREE.CircleGeometry(C * 0.95, 20)), new THREE.MeshBasicMaterial({ color: '#ffb040', fog: false }));
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = H - 3;
  big.add(crater);
  const glowTex = kit.own(canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,200,90,0.95)'); gr.addColorStop(0.35, 'rgba(255,110,30,0.45)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
  const craterGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  craterGlow.position.set(0, H + 6, 0);
  craterGlow.scale.set(120, 60, 1);
  big.add(craterGlow);
  big.position.set(0, -4, -270);
  kit.add(big);

  // Smoke plume from the crater: pooled sprites in volcano-local space.
  const smokeTex = kit.own(canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(70,55,55,0.95)'); gr.addColorStop(0.6, 'rgba(60,45,45,0.5)'); gr.addColorStop(1, 'rgba(60,45,45,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }));
  const plume = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, fog: false }));
    big.add(s);
    kit.own(s.material);
    plume.push({ s, t: i / 26, a: rng() * 6, w: rng() });
  }

  // ---- smaller static volcanoes / ridges in the far range ----
  for (let x = X0 - 300; x < X1 + 300; x += 90 + rng() * 80) {
    const r = 40 + rng() * 50; const h = 35 + rng() * 45;
    const z = -210 - rng() * 30;
    const g = volcanoGeo(rng, r, h, r * 0.08);
    far.add(g.translate(x, -3, z), (v) => kit.haze(v.y > h * 0.5 ? '#26351f' : '#1e2b19', 0.35 + (1 - (v.y + 3) / h) * 0.2));
  }
  // jungle-covered hills mid-distance
  for (let x = X0 - 200; x < X1 + 200; x += 40 + rng() * 40) {
    far.add(T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), { x, y: -1, z: -110 - rng() * 50, sx: 30 + rng() * 25, sy: 7 + rng() * 12, sz: 20 }), (v) => kit.haze(v.y > 8 ? '#2f5a26' : '#244a1f', 0.22));
  }

  // ---- lava river in the far background ----
  const riverTex = kit.own(canvasTexture(256, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#ff5a1f'); gr.addColorStop(0.5, '#ffb347'); gr.addColorStop(1, '#ff5a1f');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(60,15,5,${0.25 + rng() * 0.5})`;
      const x = rng() * 256; const y = rng() * 64;
      g.beginPath(); g.ellipse(x, y, 6 + rng() * 18, 2 + rng() * 5, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,240,160,0.8)';
    for (let i = 0; i < 40; i++) g.fillRect(rng() * 256, rng() * 64, 6 + rng() * 10, 1.5);
  }, { repeat: true }));
  const RW = X1 - X0 + 400;
  riverTex.repeat.set(RW / 40, 1);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(RW, 10), new THREE.MeshBasicMaterial({ map: riverTex, fog: false, color: '#ffffff' }));
  river.rotation.x = -Math.PI / 2;
  river.position.set((X0 + X1) / 2, 0.15, -78);
  kit.add(river);
  const riverGlow = new THREE.Mesh(new THREE.PlaneGeometry(RW, 14), new THREE.MeshBasicMaterial({
    map: kit.own(canvasTexture(4, 64, (g) => {
      const gr = g.createLinearGradient(0, 64, 0, 0);
      gr.addColorStop(0, 'rgba(255,120,40,0.55)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    })), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  riverGlow.position.set((X0 + X1) / 2, 7, -79);
  kit.add(riverGlow);
  // basalt banks along the river
  for (let x = X0 - 180; x < X1 + 180; x += 7 + rng() * 9) {
    for (const side of [-1, 1]) {
      lit.add(T(new THREE.DodecahedronGeometry(1, 0), { x: x + rng() * 4, y: 0, z: -78 + side * (5.5 + rng() * 2), sx: 2 + rng() * 3, sy: 0.8 + rng() * 1.6, sz: 1.5 + rng(), ry: rng() * 3 }), BASALT[Math.floor(rng() * 3)]);
    }
  }
  // lava rivulets feeding the river from the hills (glowing streaks)
  for (let x = X0; x < X1; x += 60 + rng() * 80) {
    glowFar.add(T(new THREE.PlaneGeometry(1.4, 26), { x, y: 0.2, z: -95, rx: -Math.PI / 2, rz: (rng() - 0.5) * 0.6 }), '#ff7a2a');
  }

  // ---- jungle: palms (instanced), ferns (instanced), broadleaf bushes ----
  const palmGeo = kit.own(makePalm(rng));
  const palms = [];
  for (let x = X0; x < X1; x += 5 + rng() * 9) {
    const z = -10 - Math.pow(rng(), 1.6) * 60;
    palms.push({ x, y: 0, z, s: 0.9 + rng() * 0.8, ry: rng() * 6, rz: (rng() - 0.5) * 0.25 });
  }
  kit.instanced(palmGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), palms, {
    colors: () => new THREE.Color().setHSL(0.25 + rng() * 0.08, 0.3, 0.8 + rng() * 0.2),
  });
  const fernGeo = kit.own(makeFern());
  const ferns = [];
  for (let x = X0; x < X1; x += 2 + rng() * 4) ferns.push({ x, y: 0, z: -9 - rng() * 30, s: 0.7 + rng() * 1.1, ry: rng() * 6 });
  for (let x = 25; x < X1; x += 55 + rng() * 60) ferns.push({ x, y: 0, z: 9.5 + rng() * 2.5, s: 0.6 + rng() * 0.3, ry: rng() * 6 });
  kit.instanced(fernGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), ferns, {
    colors: () => new THREE.Color().setHSL(0.28 + rng() * 0.08, 0.4, 0.75 + rng() * 0.25),
  });
  for (let x = X0; x < X1; x += 6 + rng() * 8) {
    const z = -12 - rng() * 40;
    const c = ['#2f6b2a', '#3d7f2f', '#285a24', '#4a8a36'][Math.floor(rng() * 4)];
    lit.add(T(new THREE.IcosahedronGeometry(1, 0), { x, y: 1, z, sx: 2 + rng() * 2.5, sy: 1.4 + rng() * 1.6, sz: 2 + rng() * 2, ry: rng() * 3 }), c);
  }

  // ---- stone idol heads ----
  for (let x = 50 + rng() * 60; x < X1; x += 110 + rng() * 90) {
    const z = -24 - rng() * 22;
    const s = 1.1 + rng() * 0.6;
    const stone = rng() < 0.5 ? '#6c665e' : '#5e5a52';
    const moss = '#4f6e35';
    const head = [
      [new THREE.BoxGeometry(4.4, 8, 3.8), 0, 4, 0, stone],
      [new THREE.BoxGeometry(4.8, 1.2, 4.2), 0, 8.4, 0, moss], // mossy crown
      [new THREE.BoxGeometry(4.6, 1.0, 1.2), 0, 6.2, 1.7, '#57524b'], // brow
      [new THREE.BoxGeometry(1.1, 3.0, 1.4), 0, 4.6, 2.2, stone], // nose
      [new THREE.BoxGeometry(3.0, 0.6, 0.8), 0, 2.3, 1.95, '#2a2522'], // mouth
      [new THREE.BoxGeometry(5.2, 1.2, 4.6), 0, 0.3, 0, '#4a4640'], // plinth
      [new THREE.BoxGeometry(0.9, 3.8, 1.2), -2.5, 4, 0.6, stone], // ears
      [new THREE.BoxGeometry(0.9, 3.8, 1.2), 2.5, 4, 0.6, stone],
    ];
    for (const [g, hx, hy, hz, c] of head) lit.add(T(g, { x: x + hx * s, y: hy * s, z: z + hz * s, s }), c);
    // glowing ember eyes
    for (const ex of [-1.1, 1.1]) glow.add(T(new THREE.BoxGeometry(0.9, 0.5, 0.3), { x: x + ex * s, y: 5.4 * s, z: z + 1.95 * s + 0.05, s }), '#ffae3a');
  }

  // ---- tiki torches ----
  const torchGeo = kit.own(mergeColored([
    [T(new THREE.CylinderGeometry(0.1, 0.13, 3.2, 6), { y: 1.6 }), '#8a6a3a'],
    [T(new THREE.CylinderGeometry(0.11, 0.11, 0.15, 6), { y: 1.0 }), '#3a2a18'],
    [T(new THREE.CylinderGeometry(0.11, 0.11, 0.15, 6), { y: 2.2 }), '#3a2a18'],
    [T(new THREE.CylinderGeometry(0.34, 0.2, 0.55, 7), { y: 3.3 }), '#4a3420'],
  ]));
  const torches = [];
  for (let x = X0 + 60; x < X1; x += 16 + rng() * 10) torches.push({ x, y: 0, z: -9.2 - rng() * 1.5 });
  for (let x = 45; x < X1; x += 110 + rng() * 80) torches.push({ x, y: 0, z: 10 + rng() * 2 });
  kit.instanced(torchGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), torches);
  const flameGeo = kit.own(mergeColored([
    [T(new THREE.ConeGeometry(0.34, 1.1, 7), { y: 0.55 }), '#ff7a1a'],
    [T(new THREE.ConeGeometry(0.2, 0.75, 7), { y: 0.45, z: 0.12 }), '#ffe070'],
  ]));
  const flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), torches.length);
  flames.frustumCulled = false;
  const flameGlowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const flameGlows = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  torches.forEach((t, i) => {
    m4.compose(p.set(t.x, 3.5, t.z), q.identity(), sc.set(1, 1, 1));
    flames.setMatrixAt(i, m4);
    const g = new THREE.Sprite(flameGlowMat);
    g.position.set(t.x, 4, t.z);
    g.scale.set(3.2, 3.2, 1);
    kit.add(g);
    flameGlows.push(g);
  });
  kit.add(flames);

  const e = new THREE.Euler();
  return {
    update(dt, time, focus) {
      const cx = focus.cameraX || focus.x;
      // Parallax: the volcano drifts slowly from right to left over the race.
      big.position.x = cx * 0.86 + 150;
      for (const pl of plume) {
        pl.t = (pl.t + dt * 0.045) % 1;
        const t = pl.t;
        pl.s.position.set(Math.sin(pl.a + t * 3) * 6 + t * 70, H + 4 + t * 120, Math.cos(pl.a) * 6);
        pl.s.scale.setScalar(20 + t * 90);
        pl.s.material.opacity = Math.min(1, t * 6) * (1 - t) * 0.85;
      }
      craterGlow.material.opacity = 0.8 + Math.sin(time * 2.3) * 0.12 + Math.sin(time * 7.1) * 0.05;
      riverTex.offset.x = (time * 0.02) % 1;
      // flicker only torches near the player
      const fx = focus.x;
      for (let i = 0; i < torches.length; i++) {
        const t = torches[i];
        if (t.x < fx - 40 || t.x > fx + 70) continue;
        const f = 0.85 + Math.sin(time * 17 + i * 3.1) * 0.12 + Math.sin(time * 29 + i) * 0.08;
        e.set(0, time * 2 + i, Math.sin(time * 9 + i) * 0.12);
        m4.compose(p.set(t.x, 3.5, t.z), q.setFromEuler(e), sc.set(1, f * 1.1, 1));
        flames.setMatrixAt(i, m4);
        flameGlows[i].scale.setScalar(2.8 + f * 0.8);
      }
      flames.instanceMatrix.needsUpdate = true;
    },
  };
}

function colorize(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const c = fn(v.fromBufferAttribute(pos, i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function colorizeMany(geos, fn) {
  return mergeKeepColors(geos.map((g) => colorize(g, fn)));
}

function mergeKeepColors(geos) {
  // All inputs already carry position/normal/color and are non-indexed.
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o);
    o += g.attributes.position.array.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Curved trunk (stacked tilted segments) + drooping fronds, vertex coloured.
function makePalm(rng) {
  const parts = [];
  let x = 0; let y = 0;
  const lean = 0.12;
  for (let i = 0; i < 7; i++) {
    const h = 1.1;
    parts.push([T(new THREE.CylinderGeometry(0.2 - i * 0.012, 0.26 - i * 0.012, h, 6), { x: x + lean * h / 2, y: y + h / 2, rz: -lean * (1 + i * 0.15) }), i % 2 ? '#7a5a36' : '#6a4c2c']);
    x += Math.sin(lean * (1 + i * 0.15)) * h;
    y += h * 0.98;
  }
  const top = [x, y];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.3;
    // frond: a flattened, drooping cone segment
    const frond = new THREE.ConeGeometry(0.9, 4.4, 4, 4);
    frond.rotateZ(-Math.PI / 2); // point along +x
    frond.translate(2.2, 0, 0);
    frond.scale(1, 0.25, 1);
    const pos = frond.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const fx = pos.getX(i);
      pos.setY(i, pos.getY(i) + fx * 0.55 - fx * fx * 0.2); // arc up then droop
    }
    frond.rotateX((rng() - 0.5) * 0.6);
    frond.rotateY(a);
    frond.translate(top[0], top[1], 0);
    parts.push([frond, k % 2 ? '#3f8a2e' : '#2f7026']);
  }
  parts.push([T(new THREE.IcosahedronGeometry(0.35, 0), { x: top[0], y: top[1] - 0.2 }), '#5a3a1a']);
  return mergeColored(parts);
}

function makeFern() {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.ConeGeometry(0.28, 1.8, 3, 1);
    leaf.rotateZ(-Math.PI / 2);
    leaf.translate(0.9, 0, 0);
    leaf.scale(1, 0.15, 1);
    const pos = leaf.attributes.position;
    for (let i = 0; i < pos.count; i++) { const fx = pos.getX(i); pos.setY(i, pos.getY(i) + fx * 0.8 - fx * fx * 0.35); }
    leaf.rotateY((k / 7) * Math.PI * 2);
    parts.push([leaf, k % 2 ? '#4a9a3a' : '#3a8030']);
  }
  return mergeColored(parts);
}
