// Neon Nights: synthwave megacity. Skyscrapers with lit window grids,
// flickering neon billboards, rooftop holograms, blinking aviation lights,
// flying cars on sky lanes, a striped retro sun over a glowing grid horizon.
// Everything reads through unlit (emissive-style) materials.
import * as THREE from 'three';
import { T, X0, X1, canvasTexture, mergeColored } from './scenery-kit.js';

const NEON = ['#ff2d95', '#00e5ff', '#b388ff', '#ffe14a', '#39ff88', '#ff7a1a'];
const NAMES = [
  ['SYNTHCOLA', '#ff2d95'], ['KAIJU ENERGY', '#39ff88'], ['PIXEL RAMEN', '#ffe14a'], ['HYPERDRIVE', '#00e5ff'],
  ['CHROME HEART', '#ff4b4b'], ['VAPOR FM 88.8', '#b388ff'], ['NEOVOLT', '#00e5ff'], ['ZERO-G GYM', '#ff7a1a'],
];

function windowTexture(rng) {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#07040f';
    g.fillRect(0, 0, 256, 256);
    // 8 columns x 16 rows of windows, 2px dark margin at the tile edge
    for (let c = 0; c < 8; c++) for (let r = 0; r < 16; r++) {
      if (rng() < 0.38) continue;
      const k = rng();
      const col = k < 0.55 ? '#ffffff' : k < 0.7 ? '#9ff4ff' : k < 0.85 ? '#ffc0e8' : '#ffd08a';
      g.globalAlpha = 0.35 + rng() * 0.65;
      g.fillStyle = col;
      g.fillRect(4 + c * 32, 4 + r * 16, 22, 9);
    }
    g.globalAlpha = 1;
  }, { repeat: true });
}

function billboardAtlas() {
  // 2 frames (left/right halves) x 8 boards (rows). Frame B is the "flicker" variant.
  return canvasTexture(1024, 1024, (g) => {
    NAMES.forEach(([name, col], i) => {
      for (let f = 0; f < 2; f++) {
        const x = f * 512;
        const y = i * 128;
        g.fillStyle = '#0a0414';
        g.fillRect(x, y, 512, 128);
        g.shadowColor = col;
        g.shadowBlur = f ? 8 : 26;
        g.strokeStyle = col;
        g.lineWidth = 6;
        g.strokeRect(x + 10, y + 10, 492, 108);
        g.font = `italic 900 ${name.length > 10 ? 58 : 70}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = f ? '#ffffff' : col;
        g.fillText(name, x + 256, y + 66, 460);
        if (f) {
          // alternate frame: underline sweep
          g.fillStyle = col;
          g.fillRect(x + 40, y + 100, 432, 6);
        }
        g.shadowBlur = 0;
      }
    });
  });
}

export function buildNeon(ctx, kit) {
  const rng = ctx.rng;
  const winTex = kit.own(windowTexture(rng));
  const TILE_W = 13; // world units per texture tile
  const TILE_H = 17;
  const bldMat = new THREE.MeshBasicMaterial({ map: winTex, vertexColors: true });
  const bldFarMat = new THREE.MeshBasicMaterial({ map: winTex, vertexColors: true, fog: false });
  const bld = kit.batch(bldMat, { chunk: 160, uv: true });
  const bldFar = kit.batch(bldFarMat, { chunk: 320, uv: true });
  const glow = kit.batch(kit.mats.glow(), { chunk: 160 });
  const glowFar = kit.batch(kit.mats.glow({ fog: false }), { chunk: 320 });

  // Box whose uvs repeat the window tile by world size; roofs sample a dark texel.
  const tower = (w, h, d) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const off = Math.floor(rng() * 8) / 8;
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) { uv.setXY(i, 0.003, 0.003); continue; }
        const span = f < 2 ? d : w;
        uv.setXY(i, off + (uv.getX(i) * span) / TILE_W, (uv.getY(i) * h) / TILE_H);
      }
    }
    return g;
  };

  const beacons = []; // aviation lights
  const holos = [];
  const city = (b, gb, zMin, zMax, hMin, hMax, dim, step, far) => {
    for (let x = X0 - (far ? 260 : 120); x < X1 + (far ? 260 : 120); x += step * (0.7 + rng() * 0.6)) {
      const w = 10 + rng() * 14;
      const d = 10 + rng() * 10;
      const h = hMin + Math.pow(rng(), 1.5) * (hMax - hMin);
      const z = zMin + rng() * (zMax - zMin);
      const tint = new THREE.Color(['#8fd8ff', '#ffb0e0', '#fff0c8', '#c8b8ff', '#ffffff'][Math.floor(rng() * 5)]).multiplyScalar(dim);
      b.add(T(tower(w, h, d), { x, y: h / 2, z }), tint);
      // setback crown
      if (rng() < 0.5) {
        const h2 = h * (0.15 + rng() * 0.2);
        b.add(T(tower(w * 0.65, h2, d * 0.65), { x, y: h + h2 / 2, z }), tint);
        if (!far) gb.add(T(new THREE.BoxGeometry(w * 0.65 + 0.3, 0.35, d * 0.65 + 0.3), { x, y: h + h2, z }), NEON[Math.floor(rng() * NEON.length)]);
      }
      // neon edge strips
      const nc = new THREE.Color(NEON[Math.floor(rng() * NEON.length)]).multiplyScalar(far ? dim * 1.3 : 1);
      gb.add(T(new THREE.BoxGeometry(w + 0.3, far ? 0.8 : 0.35, 0.3), { x, y: h, z: z + d / 2 }), nc);
      if (rng() < 0.5) {
        gb.add(T(new THREE.BoxGeometry(0.3, h, 0.3), { x: x - w / 2, y: h / 2, z: z + d / 2 }), nc);
      }
      if (!far && rng() < 0.3) {
        // vertical neon band across the face
        const bc = NEON[Math.floor(rng() * NEON.length)];
        for (let k = 0; k < 3; k++) gb.add(T(new THREE.BoxGeometry(0.25, h * 0.8, 0.2), { x: x + (k - 1) * 1.2, y: h * 0.45, z: z + d / 2 + 0.15 }), bc);
      }
      // antenna + beacon
      if (rng() < 0.45) {
        const ah = 4 + rng() * 10;
        gb.add(T(new THREE.BoxGeometry(0.25, ah, 0.25), { x, y: h + ah / 2, z }), far ? '#2a1840' : '#3a2a50');
        beacons.push([x, h + ah + 0.3, z, far]);
      }
      if (!far && rng() < 0.18) holos.push([x, h, z, w]);
    }
  };
  city(bldFar, glowFar, -250, -300, 25, 75, 0.3, 20, true);
  city(bldFar, glowFar, -150, -200, 16, 48, 0.45, 24, true);
  city(bld, glow, -58, -100, 10, 30, 0.6, 34, false);

  // ---- billboards on stilts/rooftops in the near layer ----
  const atlas = kit.own(billboardAtlas());
  const boardMats = [0, 1, 2].map(() => {
    const t = atlas.clone();
    t.repeat.set(0.5, 1);
    kit.own(t);
    return kit.own(new THREE.MeshBasicMaterial({ map: t, vertexColors: true }));
  });
  const boardBatches = boardMats.map((m) => kit.batch(m, { chunk: 200, uv: true }));
  const boardGeo = (w, h, i) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), 1 - (i + 1) / 8 + uv.getY(k) / 8);
    return geo;
  };
  const struct = kit.batch(kit.mats.glow(), { chunk: 200 });
  let bi = 0;
  for (let x = X0 + 40; x < X1; x += 38 + rng() * 40, bi++) {
    const z = -30 - rng() * 12;
    const w = 14 + rng() * 6;
    const h = w / 4;
    const y = 8 + rng() * 9;
    boardBatches[bi % 3].add(T(boardGeo(w, h, Math.floor(rng() * 8)), { x, y, z }), '#fff');
    struct.add(T(new THREE.BoxGeometry(w + 0.6, h + 0.6, 0.4), { x, y, z: z - 0.25 }), '#120a20');
    for (const s of [-1, 1]) struct.add(T(new THREE.BoxGeometry(0.4, y, 0.4), { x: x + s * w * 0.35, y: y / 2, z: z - 0.5 }), '#1c1030');
  }

  // ---- retro striped sun + stars (follow the camera: "at infinity") ----
  const sky = new THREE.Group();
  const sunTex = kit.own(canvasTexture(512, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#fff36a'); gr.addColorStop(0.45, '#ff9a3c'); gr.addColorStop(1, '#ff2d95');
    g.fillStyle = gr;
    g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = 290 + i * 26;
      g.fillRect(0, y, 512, 4 + i * 1.6);
    }
  }));
  const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(125, 125), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
  sunMesh.position.set(85, 46, -340);
  const haloTex = kit.own(canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,60,160,0.55)'); gr.addColorStop(1, 'rgba(255,60,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.set(85, 46, -345);
  sunMesh.renderOrder = -2;
  halo.renderOrder = -3;
  const starPos = [];
  for (let i = 0; i < 700; i++) starPos.push((rng() - 0.5) * 900, 60 + rng() * 260, -360 + rng() * 20);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#d8c8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  sky.add(halo, sunMesh, stars);
  kit.add(sky);

  // ---- glowing grid floor behind the track ----
  const gridTex = kit.own(canvasTexture(128, 128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    g.shadowColor = '#ff2d95'; g.shadowBlur = 10;
    g.strokeStyle = '#ff49b0'; g.lineWidth = 4;
    g.strokeRect(0, 0, 128, 128);
  }, { repeat: true }));
  const GW = X1 - X0 + 800;
  gridTex.repeat.set(GW / 8, 340 / 8);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(GW, 340), new THREE.MeshBasicMaterial({
    map: gridTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  grid.rotation.x = -Math.PI / 2;
  grid.position.set((X0 + X1) / 2, 0.02, -8.5 - 170);
  kit.add(grid);

  // ---- aviation beacons (one instanced mesh, blink via colour) ----
  const beaconGeo = kit.own(new THREE.SphereGeometry(0.6, 6, 4));
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff2020', fog: false });
  kit.instanced(beaconGeo, beaconMat, beacons.map(([x, y, z, far]) => ({ x, y, z, s: far ? 2.2 : 1 })));

  // ---- rooftop holograms: spinning wireframe icosahedra + halo ring ----
  const holoMat = new THREE.MeshBasicMaterial({ color: '#00e5ff', wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ff2d95', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const holoGeo = new THREE.IcosahedronGeometry(1, 1);
  const ringGeo = new THREE.RingGeometry(1.3, 1.5, 32);
  const holoObjs = holos.map(([x, h, z, w]) => {
    const g = new THREE.Group();
    const s = Math.min(w * 0.35, 5);
    const ico = new THREE.Mesh(holoGeo, holoMat);
    ico.scale.setScalar(s);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.scale.setScalar(s);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -s * 1.1;
    g.add(ico, ring);
    g.position.set(x, h + s * 1.6 + 1, z);
    kit.add(g);
    return { g, ico };
  });

  // ---- holographic text signs (vertical, flickering) ----
  const holoSignTex = kit.own(canvasTexture(128, 512, (g) => {
    g.fillStyle = 'rgba(0,229,255,0.12)'; g.fillRect(0, 0, 128, 512);
    g.strokeStyle = '#00e5ff'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 504);
    g.fillStyle = '#bff8ff'; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center';
    ['O', 'P', 'E', 'N', '24', '/7'].forEach((c, i) => g.fillText(c, 64, 80 + i * 76));
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 0; y < 512; y += 6) g.fillRect(0, y, 128, 2);
  }));
  const holoSignMat = new THREE.MeshBasicMaterial({ map: holoSignTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const signGeo = new THREE.PlaneGeometry(3, 12);
  for (let x = X0 + 70; x < X1; x += 90 + rng() * 60) {
    const m = new THREE.Mesh(signGeo, holoSignMat);
    m.position.set(x, 8 + rng() * 6, -26 - rng() * 6);
    kit.add(m);
  }

  // ---- flying cars on sky lanes ----
  const carGeo = kit.own(mergeColored([
    [T(new THREE.BoxGeometry(3.2, 0.7, 1.5), {}), '#2a2440'],
    [T(new THREE.BoxGeometry(1.6, 0.5, 1.3), { x: -0.2, y: 0.55 }), '#6ad8ff'],
    [T(new THREE.BoxGeometry(0.1, 0.25, 1.3), { x: 1.62, y: 0.05 }), '#ffffff'],
    [T(new THREE.BoxGeometry(0.1, 0.22, 1.5), { x: -1.62, y: 0.05 }), '#ff2040'],
    [T(new THREE.BoxGeometry(3.3, 0.08, 1.56), { y: -0.3 }), '#ff2d95'],
  ]));
  const carMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const NCARS = 44;
  const cars = new THREE.InstancedMesh(carGeo, carMat, NCARS);
  cars.frustumCulled = false;
  kit.add(cars);
  const lanes = [];
  for (let i = 0; i < 8; i++) lanes.push({ y: 9 + i * 2.2 + rng() * 1.5, z: -28 - rng() * 40, dir: i % 2 ? -1 : 1, v: 14 + rng() * 20 });
  const carState = Array.from({ length: NCARS }, (_, i) => {
    const L = lanes[i % lanes.length];
    return { L, x: (rng() - 0.3) * 260, bob: rng() * 6 };
  });

  // ---- a few low neon bollards in the foreground ----
  const bollards = [];
  for (let x = 30; x < X1; x += 70 + rng() * 70) bollards.push({ x, y: 0.5, z: 10 + rng() * 2 });
  const bollardGeo = kit.own(mergeColored([
    [T(new THREE.CylinderGeometry(0.22, 0.26, 1, 8), {}), '#1a1030'],
    [T(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 8), { y: 0.25 }), '#00e5ff'],
    [T(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 8), { y: -0.3 }), '#ff2d95'],
  ]));
  kit.instanced(bollardGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), bollards);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const ident = new THREE.Quaternion();
  const boardTex = boardMats.map((m) => m.map);
  return {
    update(dt, time, focus) {
      const cx = focus.cameraX || focus.x;
      sky.position.x = cx;
      // billboard flicker: each material group swaps frames on its own rhythm
      boardTex.forEach((t, i) => {
        const s = Math.sin(time * (1.3 + i * 0.7) + i * 2);
        const glitch = Math.sin(time * 23 + i * 5) > 0.92;
        t.offset.x = s > 0.6 || glitch ? 0.5 : 0;
      });
      const bl = Math.sin(time * 3) > 0.2 ? 1 : 0.12;
      beaconMat.color.setRGB(bl, bl * 0.08, bl * 0.08);
      holoSignMat.opacity = 0.75 + Math.sin(time * 40) * 0.1 + (Math.sin(time * 3.1) > 0.95 ? -0.5 : 0);
      for (const h of holoObjs) {
        if (Math.abs(h.g.position.x - focus.x) > 120) continue;
        h.ico.rotation.y = time * 0.8;
        h.ico.rotation.x = time * 0.3;
      }
      for (let i = 0; i < NCARS; i++) {
        const c = carState[i];
        c.x += c.L.dir * c.L.v * dt;
        const rel = c.x - cx;
        if (rel > 170) c.x -= 330;
        else if (rel < -160) c.x += 330;
        p.set(c.x, c.L.y + Math.sin(time * 1.5 + c.bob) * 0.4, c.L.z);
        m4.compose(p, c.L.dir > 0 ? ident : flip, one);
        cars.setMatrixAt(i, m4);
      }
      cars.instanceMatrix.needsUpdate = true;
    },
  };
}
