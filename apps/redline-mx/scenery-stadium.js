// Supercross stadium: open-air tiered grandstand the whole length of the
// track, light towers, jumbotrons, sponsor banners, waving flags and a
// hazy city skyline behind it all.
import * as THREE from 'three';
import { T, X0, X1, canvasTexture, jitterColor } from './scenery-kit.js';

const BRANDS = [
  ['VOLTRA', '#ffcc00', '#111'], ['KRAKEN FUEL', '#101820', '#39ff88'], ['APEX GRIP', '#e10600', '#fff'],
  ['DUSTWOLF', '#f2f2f2', '#d4001a'], ['NITRO PEAK', '#1740c9', '#ffe14a'], ['HAYWIRE', '#ff7a00', '#111'],
  ['ZENTEK', '#111', '#ff2d95'], ['RIPTIDE COLA', '#c4002b', '#fff'], ['TORQUE LAB', '#00a3e0', '#fff'],
  ['BLAZE OIL', '#222', '#ff9a1a'], ['GRITCO', '#2e9e44', '#fff'], ['MOTOHAWK', '#fff', '#1a3cff'],
  ['SKYDRIFT', '#7a2cff', '#fff'], ['REDLINE', '#e10600', '#ffe14a'], ['BOLTZ', '#ffe14a', '#1740c9'], ['ORBIT TIRES', '#111', '#fff'],
];

export function bannerAtlas() {
  // 2 columns x 8 rows of 512x128 banners.
  return canvasTexture(1024, 1024, (g) => {
    BRANDS.forEach(([name, bg, fg], i) => {
      const x = (i % 2) * 512;
      const y = Math.floor(i / 2) * 128;
      g.fillStyle = bg;
      g.fillRect(x, y, 512, 128);
      g.fillStyle = fg;
      g.fillRect(x, y + 8, 512, 6);
      g.fillRect(x, y + 114, 512, 6);
      // slanted speed stripes
      g.globalAlpha = 0.25;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(x + 400 + k * 30, y + 20); g.lineTo(x + 420 + k * 30, y + 20);
        g.lineTo(x + 390 + k * 30, y + 108); g.lineTo(x + 370 + k * 30, y + 108);
        g.fill();
      }
      g.globalAlpha = 1;
      g.font = `italic 900 ${name.length > 9 ? 64 : 76}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, x + 240, y + 66, 440);
    });
  });
}

// Plane facing +z whose uvs cover atlas cell i.
export function bannerGeo(w, h, i) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  const col = i % 2;
  const row = Math.floor(i / 2) % 8;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (col + uv.getX(k)) / 2, 1 - (row + 1) / 8 + uv.getY(k) / 8);
  }
  return geo;
}

export function waveMaterial(timeU, amp = 0.35) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = timeU;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z;
      #else
        float ph = 0.0;
      #endif
      float k = clamp(position.x / 2.4, 0.0, 1.0);
      transformed.z += sin(uTime * 7.0 - position.x * 2.6 + ph) * ${amp.toFixed(2)} * k;
      transformed.y += sin(uTime * 4.0 - position.x * 1.7 + ph) * 0.08 * k;`
    );
  };
  return m;
}

export function buildStadium(ctx, kit) {
  const rng = ctx.rng;
  const lit = kit.batch(kit.mats.lit(), { chunk: 120 });
  const far = kit.batch(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }), { chunk: 300 });
  const atlas = kit.own(bannerAtlas());
  const banners = kit.batch(new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true }), { chunk: 120, uv: true });
  const box = (w, h, d, o, c, b = lit) => b.add(T(new THREE.BoxGeometry(w, h, d), o), c);

  // ---- grandstand ----
  const ROWS = 15;
  const ROW_D = 1.25;
  const ROW_H = 0.62;
  const Z0 = -12.2;
  const SECTION = 24;
  const AISLE = 1.4;
  const seatColors = ['#d7262e', '#f2f2f2', '#1f4fd6', '#f2f2f2'];
  const concrete = '#b9b4ab';
  const zBack = Z0 - ROWS * ROW_D;
  const topY = 0.9 + (ROWS - 1) * ROW_H;
  const xa = X0 + 150;
  const xb = X1 - 150;
  let si = 0;
  for (let x = xa; x < xb; x += SECTION, si++) {
    const w = SECTION - AISLE;
    const cx = x + w / 2;
    const seat = seatColors[si % seatColors.length];
    for (let r = 0; r < ROWS; r++) {
      const zf = Z0 - r * ROW_D;
      const y = 0.9 + r * ROW_H;
      box(w, y, ROW_D, { x: cx, y: y / 2, z: zf - ROW_D / 2 }, r % 2 ? '#aaa59c' : concrete);
      box(w - 0.2, 0.42, 0.22, { x: cx, y: y + 0.21, z: zf - ROW_D * 0.75 }, jitterColor(seat, rng, 0.05));
    }
    const ax = x + w + AISLE / 2;
    for (let r = 0; r < ROWS; r++) {
      const y = 0.9 + r * ROW_H;
      box(AISLE, y - ROW_H / 2 + 0.2, ROW_D, { x: ax, y: (y - ROW_H / 2 + 0.2) / 2, z: Z0 - r * ROW_D - ROW_D / 2 }, '#8d887f');
    }
    box(0.08, 1, 0.08, { x: ax, y: topY - 0.3, z: Z0 - 2 }, '#ddd');
    if (si % 3 === 1) box(3, 1.8, 0.1, { x: cx, y: 0.9 + 5 * ROW_H + 0.9, z: Z0 - 5 * ROW_D + 0.02 }, '#1a1a1a');
    // steel buttresses behind the stand
    box(0.5, topY + 2, 0.5, { x, y: (topY + 2) / 2, z: zBack - 1.4 }, '#6c717a');
  }
  for (let x = xa; x < xb; x += 60) {
    const len = Math.min(60, xb - x);
    const cx = x + len / 2;
    // back wall + concourse rim
    box(len, topY + 2.4, 0.8, { x: cx, y: (topY + 2.4) / 2, z: zBack - 0.4 }, '#8e949c');
    box(len, 0.35, 1.2, { x: cx, y: topY + 2.4, z: zBack - 0.4 }, '#d9d9d9');
    box(len, 1.1, 0.4, { x: cx, y: 0.55, z: Z0 + 0.25 }, '#20242a');
  }
  // Banner strips: front wall and the top rim of the stand.
  let bi = 0;
  for (let x = xa; x < xb - 6; x += 6.2, bi++) {
    banners.add(T(bannerGeo(6, 1.3, (bi * 7) % 16), { x: x + 3.1, y: 1.75, z: Z0 + 0.47 }), '#fff');
    banners.add(T(bannerGeo(6, 1.4, (bi * 3 + 5) % 16), { x: x + 3.1, y: topY + 1.3, z: zBack + 0.02 }), '#fff');
  }

  // ---- light towers ----
  const lampTex = kit.own(canvasTexture(128, 64, (g) => {
    g.fillStyle = '#30343a';
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      const gr = g.createRadialGradient(8 + i * 16, 8 + j * 16, 1, 8 + i * 16, 8 + j * 16, 8);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#fff6c8'); gr.addColorStop(1, '#8a8060');
      g.fillStyle = gr;
      g.beginPath(); g.arc(8 + i * 16, 8 + j * 16, 6.5, 0, 7); g.fill();
    }
  }));
  const lamps = kit.batch(new THREE.MeshBasicMaterial({ map: lampTex, vertexColors: true }), { chunk: 200, uv: true });
  const glowTex = kit.own(canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,240,190,0.45)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }));
  const glows = [];
  const TOWER_H = 17;
  for (let x = xa + 30; x < xb; x += 96) {
    const z = zBack - 6;
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(0.22, TOWER_H, 0.22, { x: x + dx, y: TOWER_H / 2, z: z + dz }, '#9aa0a8');
    for (let y = 2; y < TOWER_H - 1; y += 2.4) {
      box(1.4, 0.12, 0.12, { x, y, z: z + 0.6, rz: 0.6 }, '#9aa0a8');
      box(1.4, 0.12, 0.12, { x, y: y + 1.2, z: z + 0.6, rz: -0.6 }, '#9aa0a8');
    }
    box(9, 5, 0.6, { x, y: TOWER_H + 2, z: z - 0.1 }, '#2a2d33');
    lamps.add(T(new THREE.PlaneGeometry(8.6, 4.6), { x, y: TOWER_H + 2, z: z + 0.22, rx: -0.2 }), '#fff');
    glows.push([x, TOWER_H + 2, z + 1.5]);
  }
  const spriteMat = kit.own(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false }));
  for (const [x, y, z] of glows) {
    const s = new THREE.Sprite(spriteMat);
    s.position.set(x, y, z);
    s.scale.set(18, 11, 1);
    kit.root.add(s);
  }

  // ---- jumbotrons ----
  const screenTex = kit.own(canvasTexture(512, 288, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 288);
    gr.addColorStop(0, '#0b1a4a'); gr.addColorStop(1, '#4a0b3a');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#e10600';
    g.beginPath(); g.moveTo(0, 190); g.lineTo(512, 120); g.lineTo(512, 150); g.lineTo(0, 220); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.font = 'italic 900 88px system-ui, sans-serif';
    g.fillText('REDLINE', 256, 92);
    g.fillStyle = '#ffe14a'; g.font = 'italic 900 56px system-ui, sans-serif';
    g.fillText('SUPERCROSS', 256, 160);
    g.fillStyle = '#9cf'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillText('ROUND 7 · THUNDER DOME', 256, 250);
  }));
  const tickerTex = kit.own(canvasTexture(1024, 64, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 64);
    g.fillStyle = '#ffb000'; g.font = 'bold 40px monospace'; g.textBaseline = 'middle';
    g.fillText('  ★ LAP RECORD 0:41.20  ★ MAKE SOME NOISE!  ★ HOLESHOT AWARD BY VOLTRA  ★ ', 0, 34);
  }, { repeat: true }));
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const tickerMat = new THREE.MeshBasicMaterial({ map: tickerTex });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#1b1d22' });
  const screenGeo = new THREE.PlaneGeometry(14, 7.9);
  const tickerGeo = new THREE.PlaneGeometry(14, 1);
  const frameGeo = new THREE.BoxGeometry(15, 10.2, 0.8);
  const postGeo = new THREE.BoxGeometry(0.8, 12, 0.8);
  for (let x = xa + 78; x < xb; x += 192) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = -0.5;
    const scr = new THREE.Mesh(screenGeo, screenMat);
    scr.position.z = 0.41;
    const tick = new THREE.Mesh(tickerGeo, tickerMat);
    tick.position.set(0, -4.7, 0.41);
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(0, -8, -0.5);
    g.add(frame, scr, tick, post);
    g.position.set(x, topY + 7.2, zBack - 3);
    kit.add(g);
  }

  // ---- flags along the top rim ----
  const timeU = { value: 0 };
  const flagMat = kit.own(waveMaterial(timeU));
  const flagGeo = kit.own(T(new THREE.PlaneGeometry(2.4, 1.4, 8, 2), { x: 1.2 }));
  const flags = [];
  const flagCols = ['#e10600', '#ffe14a', '#1740c9', '#ffffff', '#2e9e44', '#ff7a00', '#111111'];
  for (let x = xa + 4; x < xb; x += 12) {
    box(0.12, 5, 0.12, { x, y: topY + 4.9, z: zBack - 0.4 }, '#dddddd');
    flags.push({ x, y: topY + 6.6, z: zBack - 0.4 });
  }
  kit.instanced(flagGeo, flagMat, flags, { colors: () => flagCols[Math.floor(rng() * flagCols.length)] });

  // ---- city skyline (fog-free, pre-hazed) ----
  const skyline = (zMin, zMax, hMin, hMax, k, step) => {
    for (let x = X0 - 200; x < X1 + 200; x += step * (0.6 + rng() * 0.8)) {
      const w = 8 + rng() * 16;
      const h = hMin + rng() * (hMax - hMin);
      const d = 8 + rng() * 10;
      const z = zMin + rng() * (zMax - zMin);
      const base = ['#8fa3bf', '#a7b4c6', '#7d8fa8', '#b8c2cf', '#9aa9bd'][Math.floor(rng() * 5)];
      far.add(T(new THREE.BoxGeometry(w, h, d), { x, y: h / 2 - 2, z }), kit.haze(base, k));
      if (rng() < 0.35) far.add(T(new THREE.BoxGeometry(w * 0.6, h * 0.25, d * 0.6), { x, y: h + h * 0.12 - 2, z }), kit.haze(base, k));
      if (rng() < 0.2) far.add(T(new THREE.CylinderGeometry(0.2, 0.3, 14, 4), { x, y: h + 5, z }), kit.haze('#667', k));
    }
  };
  skyline(-240, -280, 50, 150, 0.78, 20);
  skyline(-170, -200, 30, 90, 0.6, 26);

  // Distant hills behind the city to break the horizon line.
  for (let x = X0 - 300; x < X1 + 300; x += 90) {
    const r = 70 + rng() * 60;
    far.add(T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), { x, y: -2, z: -320, sx: r, sy: 25 + rng() * 25, sz: 30 }), kit.haze('#5f8f5a', 0.82));
  }

  // Parking lot / concourse ground behind the stand.
  far.add(T(new THREE.PlaneGeometry(X1 - X0 + 600, 120), { x: (X0 + X1) / 2, y: 0.02, z: -100, rx: -Math.PI / 2 }), kit.haze('#6f7478', 0.2));

  // ---- a few low trackside props in the foreground ----
  const tire = kit.own(new THREE.TorusGeometry(0.42, 0.2, 6, 12));
  const tires = [];
  for (let x = 40; x < 1200; x += 90 + rng() * 80) {
    const n = 2 + Math.floor(rng() * 3);
    const z = 10 + rng() * 2;
    for (let i = 0; i < n; i++) tires.push({ x: x + (i % 2) * 0.1, y: 0.2 + i * 0.36, z, rx: Math.PI / 2 });
    banners.add(T(bannerGeo(3.2, 0.8, Math.floor(rng() * 16)), { x: x + 3, y: 0.55, z: z + 0.3 }), '#fff');
    box(3.3, 0.9, 0.1, { x: x + 3, y: 0.5, z: z + 0.22 }, '#333');
  }
  kit.instanced(tire, new THREE.MeshLambertMaterial({ color: '#1c1c1c', flatShading: true }), tires);

  return {
    update(dt, time) {
      timeU.value = time;
      tickerTex.offset.x = (time * 0.08) % 1;
    },
  };
}
