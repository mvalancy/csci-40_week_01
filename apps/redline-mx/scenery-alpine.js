// Frostbite Pass: jagged snowy peaks in hazy layers, pine forests, a warm
// timber ski lodge with smoking chimney, chairlifts with moving chairs,
// frozen lakes and snowdrifts.
import * as THREE from 'three';
import { T, X0, X1, canvasTexture, mergeColored } from './scenery-kit.js';

const ROCK = ['#465163', '#515d70', '#3d4758'];
const SNOW = '#f5f9ff';
const SNOW_SHADE = '#cfdcec';

// Jagged peak: low-poly cone with jittered ring vertices; colour by height & facing.
function peak(rng, r, h, segs = 8) {
  const geo = new THREE.ConeGeometry(r, h, segs, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!jit.has(key)) {
      const t = (v.y + h / 2) / h; // 0 base .. 1 tip
      const a = t > 0.99 ? 0 : 1;
      jit.set(key, [(rng() - 0.5) * r * 0.35 * a, (rng() - 0.5) * h * 0.12 * (t > 0.99 ? 0.5 : 1), (rng() - 0.5) * r * 0.35 * a]);
    }
    const [jx, jy, jz] = jit.get(key);
    pos.setXYZ(i, v.x + jx, v.y + h / 2 + jy, v.z + jz);
  }
  return geo;
}

export function buildAlpine(ctx, kit) {
  const rng = ctx.rng;
  const lit = kit.batch(kit.mats.lit(), { chunk: 140 });
  const far = kit.batch(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }), { chunk: 360 });

  // Colour per face for crisp snow/rock boundaries: we colour after toNonIndexed,
  // so compute by face (vertex index / 3).
  const addPeak = (batch, x, z, r, h, snowline, hazeK) => {
    const g = peak(rng, r, h, 7 + Math.floor(rng() * 3)).toNonIndexed();
    const pos = g.attributes.position;
    const faceTop = [];
    for (let f = 0; f < pos.count / 3; f++) faceTop.push(Math.max(pos.getY(f * 3), pos.getY(f * 3 + 1), pos.getY(f * 3 + 2)));
    const rock = kit.haze(ROCK[Math.floor(rng() * ROCK.length)], hazeK);
    const snow = kit.haze(SNOW, hazeK * 0.7);
    const shade = kit.haze(SNOW_SHADE, hazeK * 0.7);
    const line = h * snowline;
    const faceCol = faceTop.map((y, f) => {
      const cx = (pos.getX(f * 3) + pos.getX(f * 3 + 1) + pos.getX(f * 3 + 2)) / 3;
      const n = ((f * 7919) % 17) / 17;
      return y > line + n * h * 0.12 ? (cx > r * 0.45 ? shade : snow) : rock;
    });
    g.translate(x, -2, z);
    batch.add(g, (_, i) => faceCol[Math.floor(i / 3)]);
  };

  // ---- mountain layers ----
  for (let x = X0 - 400; x < X1 + 400; x += 60 + rng() * 60) addPeak(far, x, -300 - rng() * 40, 55 + rng() * 45, 75 + rng() * 70, 0.3, 0.5);
  for (let x = X0 - 300; x < X1 + 300; x += 55 + rng() * 55) addPeak(far, x, -200 - rng() * 30, 35 + rng() * 25, 45 + rng() * 45, 0.4, 0.3);
  for (let x = X0 - 200; x < X1 + 200; x += 60 + rng() * 60) addPeak(far, x, -125 - rng() * 30, 25 + rng() * 20, 22 + rng() * 26, 0.55, 0.15);

  // Rolling snowfield in front of the mountains.
  for (let x = X0 - 200; x < X1 + 200; x += 50) {
    far.add(T(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), { x: x + rng() * 20, y: -0.5, z: -70 - rng() * 40, sx: 50 + rng() * 30, sy: 6 + rng() * 10, sz: 30 }), (v) => kit.haze(v.y > 4 ? SNOW : SNOW_SHADE, 0.08));
  }

  // ---- pine forests (one InstancedMesh) ----
  const pineGeo = kit.own(mergeColored([
    [T(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5), { y: 0.6 }), '#5a3d28'],
    [T(new THREE.ConeGeometry(1.5, 2.2, 7), { y: 2.0 }), '#1f4d36'],
    [T(new THREE.ConeGeometry(1.15, 1.9, 7), { y: 3.2 }), '#245a3e'],
    [T(new THREE.ConeGeometry(0.8, 1.6, 7), { y: 4.3 }), '#2a6445'],
    [T(new THREE.ConeGeometry(0.62, 0.5, 7), { y: 2.85 }), SNOW],
    [T(new THREE.ConeGeometry(0.45, 0.45, 7), { y: 3.95 }), SNOW],
    [T(new THREE.ConeGeometry(0.3, 0.5, 7), { y: 4.9 }), SNOW],
  ]));
  const pines = [];
  // clustered forests
  for (let x = X0; x < X1; x += 30 + rng() * 40) {
    const n = 20 + Math.floor(rng() * 35);
    const cz = -14 - rng() * 45;
    for (let i = 0; i < n; i++) {
      const z = cz + (rng() - 0.5) * 30;
      if (z > -9.5) continue;
      pines.push({ x: x + (rng() - 0.5) * 36, y: 0, z, s: 0.9 + rng() * 1.4, ry: rng() * 6 });
    }
  }
  // scattered singles near the track
  for (let x = X0; x < X1; x += 6 + rng() * 10) pines.push({ x, y: 0, z: -10 - rng() * 6, s: 0.7 + rng() * 0.8, ry: rng() * 6 });
  kit.instanced(pineGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), pines, {
    colors: () => new THREE.Color().setHSL(0.35 + rng() * 0.08, 0.15, 0.85 + rng() * 0.15),
  });

  // ---- frozen lakes ----
  const iceTex = kit.own(canvasTexture(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    gr.addColorStop(0, '#bfe6fa'); gr.addColorStop(0.8, '#9ad2f0'); gr.addColorStop(1, '#e8f6ff');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      let x = rng() * 256; let y = rng() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
  }));
  const iceMat = new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.15, metalness: 0.2 });
  const lakeGeo = new THREE.CircleGeometry(1, 28);
  for (let x = 90 + rng() * 60; x < X1; x += 260 + rng() * 140) {
    const lake = new THREE.Mesh(lakeGeo, iceMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(x, 0.03, -34 - rng() * 10);
    lake.scale.set(26 + rng() * 14, 12 + rng() * 5, 1);
    kit.add(lake);
    // snowy rim
    lit.add(T(new THREE.TorusGeometry(1, 0.035, 3, 28), { x, y: 0.03, z: lake.position.z, rx: -Math.PI / 2, sx: lake.scale.x, sy: lake.scale.y, sz: 12 }), SNOW_SHADE);
  }

  // ---- ski lodges ----
  const glowWin = kit.batch(kit.mats.glow(), { chunk: 200 });
  const smokeSources = [];
  const lodge = (x, z, s) => {
    const W = 14 * s; const H = 5 * s; const D = 8 * s;
    lit.add(T(new THREE.BoxGeometry(W, 1.2, D + 0.4), { x, y: 0.6, z }), '#6f6a66'); // stone base
    // log walls: stacked slightly alternating brown slabs
    for (let y = 1.2; y < H + 1.2; y += 0.5 * s) lit.add(T(new THREE.BoxGeometry(W, 0.5 * s, D), { x, y: y + 0.25 * s, z }), Math.round(y / (0.5 * s)) % 2 ? '#7a4a2a' : '#6a3f23');
    // A-frame roof: triangular prism (3-sided cylinder), snow on top
    const roofY = H + 1.2;
    const prism = (w, d, rh) => {
      const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rh)]);
      return new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2).rotateY(Math.PI / 2);
    };
    lit.add(prism(W + 1.6, D + 1.6, D * 0.55).translate(x, roofY, z), '#4a2e1c');
    lit.add(prism(W + 1.7, D + 1.2, D * 0.55).translate(x, roofY + 0.35, z), (v) => new THREE.Color(v.y > roofY + 1.2 ? SNOW : '#4a2e1c'));
    // warm gable window under the ridge
    glowWin.add(T(new THREE.CircleGeometry(1.4 * s, 3), { x: x + W / 2 + 0.03, y: roofY + 1.2 * s, z, ry: Math.PI / 2, rz: Math.PI / 2 }), '#ffb24a');
    // windows row
    for (let i = 0; i < 5; i++) {
      const wx = x - W / 2 + W * (i + 0.5) / 5;
      glowWin.add(T(new THREE.PlaneGeometry(1.4 * s, 1.6 * s), { x: wx, y: 2.8 * s + 0.4, z: z + D / 2 + 0.03 }), '#ffc46a');
      glowWin.add(T(new THREE.PlaneGeometry(1.4 * s, 1.2 * s), { x: wx, y: 4.9 * s + 0.4, z: z + D / 2 + 0.03 }), i % 2 ? '#ffb24a' : '#ffd88a');
      lit.add(T(new THREE.BoxGeometry(1.7 * s, 0.18, 0.3), { x: wx, y: 2.8 * s - 0.5 * s + 0.35, z: z + D / 2 + 0.1 }), '#f2f6fb'); // snowy sill
    }
    // door
    lit.add(T(new THREE.BoxGeometry(1.6 * s, 2.6 * s, 0.2), { x, y: 1.2 + 1.3 * s, z: z + D / 2 + 0.05 }), '#3c2415');
    // chimney
    const cx = x + W * 0.28;
    lit.add(T(new THREE.BoxGeometry(1.2 * s, 5 * s, 1.2 * s), { x: cx, y: roofY + 2.5 * s, z: z - 0.5 }), '#77716b');
    lit.add(T(new THREE.BoxGeometry(1.4 * s, 0.3, 1.4 * s), { x: cx, y: roofY + 5 * s, z: z - 0.5 }), SNOW);
    smokeSources.push([cx, roofY + 5 * s + 0.3, z - 0.5]);
    // snow piles at the base
    for (const dx of [-1, 1]) lit.add(T(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), { x: x + dx * (W / 2 + 1), y: 0, z: z + D / 2, sx: 2.5, sy: 1.2, sz: 2 }), SNOW);
  };
  for (let x = 60 + rng() * 60; x < X1; x += 300 + rng() * 120) lodge(x, -22 - rng() * 6, 1 + rng() * 0.25);

  // Chimney smoke: pooled sprites.
  const smokeTex = kit.own(canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(235,240,248,0.9)'); gr.addColorStop(1, 'rgba(235,240,248,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }));
  const smoke = [];
  smokeSources.forEach((src) => {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
      kit.add(s);
      smoke.push({ s, src, t: i / 7 });
    }
  });

  // ---- chairlifts ----
  const lifts = [];
  const chairGeo = kit.own(mergeColored([
    [T(new THREE.BoxGeometry(0.08, 2.2, 0.08), { y: -1.1 }), '#333'],
    [T(new THREE.BoxGeometry(1.8, 0.14, 0.8), { y: -2.2, z: 0.1 }), '#d7262e'],
    [T(new THREE.BoxGeometry(1.8, 0.8, 0.12), { y: -1.8, z: -0.3 }), '#d7262e'],
    [T(new THREE.BoxGeometry(1.9, 0.06, 0.06), { y: -1.5, z: 0.5 }), '#bbb'],
  ]));
  const chairMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (let x0 = 120 + rng() * 100; x0 < X1 - 100; x0 += 420 + rng() * 150) {
    const z = -58;
    const len = 150;
    const h0 = 3; const h1 = 48;
    // the hill it climbs
    lit.add(T(peak(rng, 70, 60, 9), { x: x0 + len + 10, y: -4, z: z - 30 }), (v) => new THREE.Color(v.y > 30 ? SNOW : v.y > 18 ? SNOW_SHADE : '#dfe8f3'));
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = x0 + t * len;
      const y = h0 + (h1 - h0) * t;
      pts.push([x, y]);
      const th = 9;
      lit.add(T(new THREE.BoxGeometry(0.5, y + th, 0.5), { x, y: (y + th) / 2, z }), '#6f7682');
      lit.add(T(new THREE.BoxGeometry(0.4, 0.4, 3.6), { x, y: y + th, z }), '#6f7682');
    }
    // stations
    lit.add(T(new THREE.BoxGeometry(6, 5, 7), { x: x0 - 3, y: 2.5, z }), '#8a5a36');
    lit.add(T(new THREE.BoxGeometry(7, 0.6, 8), { x: x0 - 3, y: 5.3, z }), SNOW);
    lit.add(T(new THREE.BoxGeometry(6, 5, 7), { x: x0 + len + 3, y: h1 + 2.5 - 4, z }), '#8a5a36');
    // cables: thin boxes
    const dx = len; const dy = h1 - h0;
    const L = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    for (const dz of [-1.6, 1.6]) lit.add(T(new THREE.BoxGeometry(L, 0.07, 0.07), { x: x0 + len / 2, y: (h0 + h1) / 2 + 9, z: z + dz, rz: ang }), '#222');
    const n = Math.floor(L / 9) * 2;
    const im = new THREE.InstancedMesh(chairGeo, chairMat, n);
    im.frustumCulled = false;
    kit.add(im);
    lifts.push({ x0, z, h0: h0 + 9, h1: h1 + 9, len, L, n, im, phase: 0 });
  }

  // ---- snowdrifts ----
  const drifts = kit.batch(new THREE.MeshLambertMaterial({ vertexColors: true }), { chunk: 140 });
  for (let x = X0; x < X1; x += 8 + rng() * 14) {
    drifts.add(T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), { x, y: -0.05, z: -9.5 - rng() * 8, sx: 2 + rng() * 5, sy: 0.6 + rng() * 1.2, sz: 1.2 + rng() * 2, ry: rng() }), (v) => new THREE.Color(v.y > 0.5 ? SNOW : '#dde8f4'));
  }
  for (let x = 20; x < X1; x += 60 + rng() * 80) {
    drifts.add(T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), { x, y: -0.05, z: 10 + rng() * 3, sx: 2 + rng() * 3, sy: 0.4 + rng() * 0.5, sz: 1.2 + rng() }), SNOW);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    update(dt, time, focus) {
      const fx = focus.x;
      for (const L of lifts) {
        if (L.x0 > fx + 120 || L.x0 + L.len < fx - 80) continue;
        L.phase = (L.phase + dt * 2.2) % 9;
        const half = L.n / 2;
        for (let i = 0; i < L.n; i++) {
          const up = i < half;
          let d = ((i % half) * 9 + L.phase) % (half * 9);
          if (!up) d = half * 9 - d;
          const t = Math.min(1, d / L.L);
          p.set(L.x0 + t * L.len, L.h0 + (L.h1 - L.h0) * t, L.z + (up ? 1.6 : -1.6));
          q.set(0, 0, Math.sin(time * 1.3 + i) * 0.03, 1).normalize();
          m4.compose(p, q, one);
          L.im.setMatrixAt(i, m4);
        }
        L.im.instanceMatrix.needsUpdate = true;
      }
      for (const sm of smoke) {
        if (Math.abs(sm.src[0] - fx) > 90) { sm.s.visible = false; continue; }
        sm.s.visible = true;
        sm.t = (sm.t + dt * 0.18) % 1;
        const t = sm.t;
        sm.s.position.set(sm.src[0] + t * 5 + Math.sin(time + t * 6) * 0.4, sm.src[1] + t * 9, sm.src[2]);
        sm.s.scale.setScalar(1 + t * 4);
        sm.s.material.opacity = (1 - t) * 0.7 * Math.min(1, t * 8);
      }
    },
  };
}
