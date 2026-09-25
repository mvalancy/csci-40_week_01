// Crowds: bleacher stands along the far side of the whole track plus fan
// clusters at every big ramp. Kinds (humans, robots, aliens, yetis, penguins,
// monkeys, cowboys, tikis, holograms, mascots, dogs) are built in
// spectators-kinds.js; each body part of each kind is ONE InstancedMesh.
// Spectators are sorted by x per kind, so the ±80-unit animation window is a
// contiguous index range and only that slice of each instance buffer uploads.
import * as THREE from 'three';
import { KINDS, G, propLook } from './spectators-kinds.js';
import { makeSignAtlas, signTile, makeFlagAtlas, flagTile, makeGlowTexture, makeFlashTexture } from './spectators-tex.js';

const WINDOW = 80; // flags wave within this distance of focus.x
const LIVE_BACK = 50; // spectators animate in [focus.x-50, focus.x+75] (inside the ±80 budget, covers the view)
const LIVE_AHEAD = 75;
const CHUNK = 110;
const WAVE_SPEED = 42; // stadium wave travels +x (faster than the bike, so you see it overtake)
const WAVE_LEN = 170;
const WAVE_W = 11;
const ROWS = 8;
const ROW_Z0 = -12.6;
const ROW_DZ = 2.0;
const ROW_Y0 = 1.0;
const ROW_DY = 1.0;
const SECTION = 58;
const AISLE = 4;
const MAX_FLASH = 72;

const STAND_STYLE = {
  stadium: { step: '#9aa2ac', seat: ['#2b6cd4', '#d7263d'], strip: '#00e5ff' },
  canyon: { step: '#b98a55', seat: ['#7a4a22', '#8a5a2e'], strip: '#ffb347' },
  alpine: { step: '#8a6a4a', seat: ['#f4f8fc', '#e6eef8'], strip: '#9fd4f5' },
  neon: { step: '#2a2440', seat: ['#3a3456', '#2f2a4a'], strip: '#ff2d95' },
  volcano: { step: '#5a4030', seat: ['#7a9a3a', '#6b8a30'], strip: '#ff7a1f' },
};

export function createSpectators(ctx) {
  const { scene, biome, track } = ctx;
  const rng = ctx.rng;
  const night = !!biome.night;
  const root = new THREE.Group();
  root.name = 'spectators';
  scene.add(root);
  const trash = [];
  const own = (x) => (trash.push(x), x);

  // ---------- materials (shared; colour comes from instanceColor) ----------
  const selfU = { value: night ? 0.3 : 0.1 };
  const timeU = { value: 0 };
  const focusU = { value: 0 };
  const selfLit = (m) => {
    m.onBeforeCompile = (s) => {
      s.uniforms.uSelf = selfU;
      s.fragmentShader = s.fragmentShader
        .replace('void main() {', 'uniform float uSelf;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uSelf;');
    };
    return m;
  };
  const tiled = (m, scale, wave) => {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => {
      if (prev) prev(s, r);
      s.uniforms.uTime = timeU;
      s.uniforms.uFocusX = focusU;
      s.vertexShader = s.vertexShader
        .replace('void main() {', `attribute vec2 aTile;\nuniform float uTime;\nuniform float uFocusX;\nvoid main() {`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n\tvMapUv = vMapUv * vec2(${scale[0].toFixed(3)}, ${scale[1].toFixed(3)}) + aTile;`);
      if (wave) {
        s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float wx = instanceMatrix[3].x;
          float amp = 1.0 - smoothstep(${WINDOW - 10}.0, ${WINDOW + 10}.0, abs(wx - uFocusX));
          float k = position.x;
          transformed.z += sin(k * 3.4 - uTime * 7.0 + wx * 0.7) * k * 0.2 * amp + k * 0.05;
          transformed.y += sin(k * 2.2 - uTime * 5.0 + wx) * k * 0.05 * amp;`);
      }
    };
    m.customProgramCacheKey = () => `spect-tile-${wave ? 1 : 0}`;
    return m;
  };
  const glowTex = own(makeGlowTexture());
  const flashTex = own(makeFlashTexture());
  const signTex = own(makeSignAtlas(biome.id));
  const flagTex = own(makeFlagAtlas());
  const mats = {
    std: own(selfLit(new THREE.MeshStandardMaterial({ roughness: 0.75 }))),
    shag: own(selfLit(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }))),
    glow: own(new THREE.MeshBasicMaterial({ toneMapped: false })),
    holo: own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
    halo: own(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.9 })),
    sign: own(tiled(new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }), [0.5, 0.125], false)),
  };
  mats.std.customProgramCacheKey = () => 'spect-std';
  mats.shag.customProgramCacheKey = () => 'spect-shag';

  // ---------- placement ----------
  const mix = Object.entries(biome.spectators || { human: 1 }).filter(([k, w]) => KINDS[k] && w > 0);
  if (!mix.length) mix.push(['human', 1]);
  const total = mix.reduce((a, [, w]) => a + w, 0);
  const pickKind = () => {
    let r = rng() * total;
    for (const [k, w] of mix) if ((r -= w) <= 0) return k;
    return mix[mix.length - 1][0];
  };
  const people = [];
  const addPerson = (kind, x, y, z, trk) => {
    const def = KINDS[kind];
    let r = rng();
    let mode = 0;
    for (let m = 0; m < 4; m++) if ((r -= def.modes[m]) <= 0) { mode = m; break; }
    const look = { ...def.look(rng, biome), ...propLook(rng, mode, night) };
    if ((look.glow || look.phone) && mode === 0) mode = 1;
    // Giant mascots are toned down in the stands so they don't wall off the rows behind.
    const shrink = kind === 'mascot' && !trk ? 0.62 : 1;
    people.push({ kind, x, y, z, trk, mode, look, s: (def.scale[0] + rng() * (def.scale[1] - def.scale[0])) * shrink, ry: (rng() - 0.5) * 0.5 });
  };

  // Bleacher stands: stepped rows over the whole track length.
  const style = STAND_STYLE[biome.id] || STAND_STYLE.stadium;
  const steps = [];
  const flags = [];
  for (let s0 = track.begin; s0 < track.end; s0 += SECTION + AISLE) {
    const s1 = Math.min(s0 + SECTION, track.end + 20);
    for (let r = 0; r < ROWS; r++) {
      const z = ROW_Z0 - r * ROW_DZ;
      const y = ROW_Y0 + r * ROW_DY;
      steps.push({ x0: s0, x1: s1, z, y, r });
      for (let x = s0 + 0.7; x < s1 - 0.5; x += 1.15) {
        if (rng() < 0.64) addPerson(pickKind(), x + (rng() - 0.5) * 0.3, y, z + 0.15 + (rng() - 0.5) * 0.35, 0);
      }
    }
    for (let x = s0 + 5 + rng() * 6; x < s1 - 3; x += 9 + rng() * 9) {
      const r = Math.floor(rng() * ROWS);
      flags.push({ x, y: ROW_Y0 + r * ROW_DY, z: ROW_Z0 - r * ROW_DZ - 0.75, h: 3.2 + rng() * 1.2, tile: Math.floor(rng() * 4) });
    }
  }

  // Trackside fans on a dirt berm behind the hay bales at every big ramp.
  const berms = [];
  const bigRamps = track.ramps.filter((r) => r.h > 3);
  for (const ramp of bigRamps) {
    const xa = ramp.x0 - 5;
    const xb = ramp.x0 + ramp.up + ramp.top + ramp.down + 5;
    for (let x = xa; x < xb; x += 1.5) {
      const hb = Math.max(0, Math.round(track.height(x + 0.75) * 0.7 * 4) / 4);
      berms.push({ x0: x, x1: x + 1.5, h: hb });
      for (const [dz, dy] of [[-8.7, 0], [-9.9, 0.6]]) {
        for (const xx of [x + 0.35, x + 1.1]) {
          if (rng() < 0.8) addPerson(pickKind(), xx + (rng() - 0.5) * 0.25, hb + dy, dz + (rng() - 0.5) * 0.3, 1);
        }
      }
    }
    // A mascot and a dog per cluster when the biome has them.
    if (biome.spectators?.mascot) addPerson('mascot', xa - 1.5, 0, -10.2, 1);
    if (biome.spectators?.dog) addPerson('dog', xb + 0.6, 0, -8.6, 1);
    flags.push({ x: xa + 1, y: 0.6, z: -10.8, h: 4.5, tile: Math.floor(rng() * 4) });
    flags.push({ x: xb - 2, y: 0.6, z: -10.8, h: 4.5, tile: Math.floor(rng() * 4) });
  }

  // ---------- static structures ----------
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const unitBox = own(new THREE.BoxGeometry(1, 1, 1));
  const addBoxes = (list, mat, color) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(unitBox, mat, list.length);
    list.forEach((b, i) => {
      m4.compose(v.set((b.x0 + b.x1) / 2, b.y0 + (b.y1 - b.y0) / 2, (b.z0 + b.z1) / 2), q.identity(), sc.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(color(b, i)));
    });
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const standMat = own(selfLit(new THREE.MeshStandardMaterial({ roughness: 0.9 })));
  standMat.customProgramCacheKey = () => 'spect-std';
  const stepBoxes = steps.map((s) => ({ x0: s.x0, x1: s.x1, y0: 0, y1: s.y, z0: s.z - ROW_DZ / 2, z1: s.z + ROW_DZ / 2, r: s.r }));
  addBoxes(stepBoxes, standMat, (b) => col.set(style.step).offsetHSL(0, 0, (b.r % 2) * 0.04 - 0.02).getHex());
  const seats = steps.map((s) => ({ x0: s.x0, x1: s.x1, y0: s.y, y1: s.y + 0.12, z0: s.z + ROW_DZ / 2 - 0.5, z1: s.z + ROW_DZ / 2, r: s.r }));
  addBoxes(seats, standMat, (b) => style.seat[b.r % 2]);
  // Back wall so the top row never floats against the sky.
  const walls = [];
  for (let s0 = track.begin; s0 < track.end; s0 += SECTION + AISLE) walls.push({ x0: s0, x1: Math.min(s0 + SECTION, track.end + 20), y0: 0, y1: ROW_Y0 + ROWS * ROW_DY + 0.8, z0: ROW_Z0 - ROWS * ROW_DZ + 0.6, z1: ROW_Z0 - ROWS * ROW_DZ + 1 });
  addBoxes(walls, standMat, () => col.set(style.step).offsetHSL(0, 0, -0.08).getHex());
  if (night) {
    const strips = steps.map((s) => ({ x0: s.x0, x1: s.x1, y0: s.y - 0.12, y1: s.y - 0.02, z0: s.z + ROW_DZ / 2, z1: s.z + ROW_DZ / 2 + 0.04, r: s.r }));
    addBoxes(strips, mats.glow, (b) => (b.r % 2 ? style.strip : '#00e5ff'));
  }
  const bermBoxes = [];
  for (const b of berms) {
    if (b.h > 0.05) bermBoxes.push({ x0: b.x0, x1: b.x1, y0: 0, y1: b.h, z0: -10.6, z1: -8.1 });
    bermBoxes.push({ x0: b.x0, x1: b.x1, y0: b.h, y1: b.h + 0.6, z0: -10.6, z1: -9.4 });
  }
  addBoxes(bermBoxes, standMat, (b, i) => col.set(b.y1 - b.y0 === 0.6 ? style.seat[0] : biome.dirt?.skirt || '#7a4a22').offsetHSL(0, 0, (i % 3) * 0.02).getHex());

  // Flags on poles, waving in the shader (only near the focus).
  if (flags.length) {
    const poleGeo = own(G.cyl(0.05, 0.05, 1, 0, 0.5, 0, 5));
    const poles = new THREE.InstancedMesh(poleGeo, standMat, flags.length);
    const flagGeo = own(G.plane(1.8, 1.1, 0.9, -0.55, 0, 8, 2));
    const flagMat = own(tiled(selfLit(new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 })), [0.5, 0.5], true));
    const flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, flags.length);
    const tiles = new Float32Array(flags.length * 2);
    flags.forEach((f, i) => {
      poles.setMatrixAt(i, m4.compose(v.set(f.x, f.y, f.z), q.identity(), sc.set(1, f.h, 1)));
      poles.setColorAt(i, col.set('#d8d8d8'));
      flagMesh.setMatrixAt(i, m4.compose(v.set(f.x + 0.04, f.y + f.h, f.z), q.identity(), sc.set(1, 1, 1)));
      tiles.set(flagTile(f.tile), i * 2);
    });
    flagGeo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 2));
    poles.frustumCulled = false;
    flagMesh.frustumCulled = false;
    root.add(poles, flagMesh);
  }

  // ---------- spectator instanced meshes ----------
  // Per kind, spectators are sorted by x and cut into CHUNK-long slices; every
  // part gets one InstancedMesh per slice so off-screen slices are frustum
  // culled. A contiguous spectator range maps to a contiguous slot range.
  const kinds = [];
  for (const [id, def] of Object.entries(KINDS)) {
    const list = people.filter((p) => p.kind === id).sort((a, b) => a.x - b.x);
    if (!list.length) continue;
    const n = list.length;
    const chunkOf = Int32Array.from(list, (p) => Math.floor((p.x - track.begin + 10) / CHUNK));
    const R = {
      id, def, n,
      x: Float32Array.from(list, (p) => p.x),
      y: Float32Array.from(list, (p) => p.y),
      z: Float32Array.from(list, (p) => p.z),
      cy: Float32Array.from(list, (p) => Math.cos(p.ry)),
      sy: Float32Array.from(list, (p) => Math.sin(p.ry)),
      s: Float32Array.from(list, (p) => p.s),
      ph: Float32Array.from(list, () => rng() * Math.PI * 2),
      en: Float32Array.from(list, () => 0.3 + rng() * 0.7),
      mode: Uint8Array.from(list, (p) => p.mode),
      trk: Uint8Array.from(list, (p) => p.trk),
      armScale: def.armScale || 1,
      pa: 0, pb: 0,
      parts: [],
      piv: {},
    };
    for (const [k, p] of Object.entries(def.pivots || {})) R.piv[k] = p;
    for (const part of def.parts) {
      const slot = new Int32Array(n).fill(-1);
      const pre = new Int32Array(n + 1);
      const chunks = []; // { mesh, first(global slot), arr }
      const cm = new Int32Array(n); // spectator → chunk mesh index
      let c = 0;
      for (let i = 0; i < n; i++) {
        pre[i] = c;
        if (part.has && !part.has(list[i].look)) continue;
        if (!chunks.length || chunks[chunks.length - 1].key !== chunkOf[i]) chunks.push({ key: chunkOf[i], first: c, count: 0 });
        chunks[chunks.length - 1].count++;
        cm[i] = chunks.length - 1;
        slot[i] = c++;
      }
      pre[n] = c;
      if (!c) continue;
      const geo = own(part.geo.clone());
      if (part.mat === 'sign') {
        const tiles = new Float32Array(c * 2);
        for (let i = 0; i < n; i++) if (slot[i] >= 0) tiles.set(signTile(list[i].look.tile), slot[i] * 2);
        geo.userData.tiles = tiles;
      }
      for (const ch of chunks) {
        // Geometry objects are shared between chunk meshes, but the sign tile
        // attribute is per instance, so sign chunks each get their own clone.
        let g = geo;
        if (geo.userData.tiles) {
          g = own(geo.clone());
          g.setAttribute('aTile', new THREE.InstancedBufferAttribute(geo.userData.tiles.slice(ch.first * 2, (ch.first + ch.count) * 2), 2));
        }
        const mesh = new THREE.InstancedMesh(g, mats[part.mat], ch.count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        ch.mesh = mesh;
        ch.arr = mesh.instanceMatrix.array;
        root.add(mesh);
      }
      for (let i = 0; i < n; i++) if (slot[i] >= 0) {
        const ch = chunks[cm[i]];
        ch.mesh.setColorAt(slot[i] - ch.first, col.set(part.color(list[i].look)));
      }
      R.parts.push({ id: part.id, anim: part.anim, slot, pre, cm, chunks, pivot: part.pivot || null });
    }
    kinds.push(R);
  }

  // ---------- posing (hand-rolled 3x4 matrices straight into the buffers) ----------
  const B = new Float32Array(12); // base: col0, col1, col2, translation
  const Wm = { armL: new Float32Array(12), armR: new Float32Array(12), head: new Float32Array(12), tail: new Float32Array(12) };
  // out = B * [L | p], L given as 3 local columns (9 numbers).
  const child = (out, l0, l1, l2, l3, l4, l5, l6, l7, l8, px, py, pz) => {
    for (let r = 0; r < 3; r++) {
      out[r] = B[r] * l0 + B[3 + r] * l1 + B[6 + r] * l2;
      out[3 + r] = B[r] * l3 + B[3 + r] * l4 + B[6 + r] * l5;
      out[6 + r] = B[r] * l6 + B[3 + r] * l7 + B[6 + r] * l8;
      out[9 + r] = B[r] * px + B[3 + r] * py + B[6 + r] * pz + B[9 + r];
    }
  };
  const put = (arr, o, M) => {
    arr[o] = M[0]; arr[o + 1] = M[1]; arr[o + 2] = M[2]; arr[o + 3] = 0;
    arr[o + 4] = M[3]; arr[o + 5] = M[4]; arr[o + 6] = M[5]; arr[o + 7] = 0;
    arr[o + 8] = M[6]; arr[o + 9] = M[7]; arr[o + 10] = M[8]; arr[o + 11] = 0;
    arr[o + 12] = M[9]; arr[o + 13] = M[10]; arr[o + 14] = M[11]; arr[o + 15] = 1;
  };
  const PV = new Float32Array(12);
  const restArm = [0.22, 2.3, 2.7, 2.8];
  let hype = 0;

  function pose(R, i, live, t, fx) {
    const mode = R.mode[i];
    const s = R.s[i];
    let bob = 0, rz = 0, armL = mode === 1 ? 0.22 : restArm[mode], armR = restArm[mode], yaw = 0, nod = 0, wag = 0.3, hide = false, jx = 0, signBob = 0;
    if (live) {
      const x = R.x[i];
      const ph = R.ph[i];
      const en = R.en[i];
      const d = x - fx;
      const trk = R.trk[i];
      let wave = 0;
      if (!trk) {
        const wp = (((x - t * WAVE_SPEED) % WAVE_LEN) + WAVE_LEN) % WAVE_LEN;
        if (wp < WAVE_W) wave = Math.sin((wp / WAVE_W) * Math.PI);
      }
      const near = Math.max(0, 1 - Math.abs(d - 4) / (trk ? 32 : 42));
      const cheer = hype * near * (trk ? 1 : 0.75);
      const sp = 5 + en * 3 + cheer * 5;
      const bounce = Math.abs(Math.sin(t * sp + ph));
      bob = bounce * (0.03 + en * 0.05 + cheer * (trk ? 0.75 : 0.45)) + wave * 0.5;
      const wav = Math.sin(t * (6 + en * 4) + ph * 3);
      if (mode === 0) { armL = 0.22 + 0.18 * Math.sin(t * 9 + ph); armR = 0.22 + 0.18 * Math.sin(t * 9 + ph + 1); }
      else if (mode === 1) { armR = 2.3 + 0.5 * wav; armL = 0.22 + 0.1 * wav; }
      else if (mode === 2) { armL = armR = 2.55 + 0.35 * Math.sin(t * 8 + ph); }
      else { armL = armR = 2.8 + 0.06 * wav; signBob = Math.sin(t * 7 + ph) * 0.06; }
      const up = Math.max(wave, cheer);
      if (up > 0 && mode !== 3) {
        armL += (2.8 - 0.4 * wav - armL) * up;
        armR += (2.8 + 0.4 * wav - armR) * up;
      }
      yaw = Math.max(-0.9, Math.min(0.9, -d * 0.025));
      nod = -0.12 * bounce * (0.5 + cheer);
      wag = Math.sin(t * (12 + cheer * 12) + ph) * 0.75;
      rz = R.def.sway ? Math.sin(t * 1.7 + ph) * R.def.sway * (1 + cheer * 1.5) : 0;
      if (R.def.holo) {
        if (Math.random() < 0.025) hide = true;
        if (Math.random() < 0.05) jx = (Math.random() - 0.5) * 0.3;
      }
    }
    // Base = T * Ry * Rz * S
    const cy = R.cy[i], sy = R.sy[i];
    const cz = rz ? Math.cos(rz) : 1, sz = rz ? Math.sin(rz) : 0;
    if (hide) B.fill(0);
    else {
      B[0] = cy * cz * s; B[1] = sz * s; B[2] = -sy * cz * s;
      B[3] = -cy * sz * s; B[4] = cz * s; B[5] = sy * sz * s;
      B[6] = sy * s; B[7] = 0; B[8] = cy * s;
      B[9] = R.x[i] + jx; B[10] = R.y[i] + bob; B[11] = R.z[i];
    }
    const pv = R.piv;
    const as = R.armScale;
    if (pv.armL) { const a = -armL * as, c = Math.cos(a), sn = Math.sin(a); child(Wm.armL, c, sn, 0, -sn, c, 0, 0, 0, 1, pv.armL[0], pv.armL[1], pv.armL[2]); }
    if (pv.armR) { const a = armR * as, c = Math.cos(a), sn = Math.sin(a); child(Wm.armR, c, sn, 0, -sn, c, 0, 0, 0, 1, pv.armR[0], pv.armR[1], pv.armR[2]); }
    if (pv.head) {
      const cw = Math.cos(yaw), sw = Math.sin(yaw), cn = Math.cos(nod), sn = Math.sin(nod);
      child(Wm.head, cw, 0, -sw, sw * sn, cn, cw * sn, sw * cn, -sn, cw * cn, pv.head[0], pv.head[1], pv.head[2]);
    }
    if (pv.tail) { const c = Math.cos(wag), sn = Math.sin(wag); child(Wm.tail, c, 0, -sn, 0, 1, 0, sn, 0, c, pv.tail[0], pv.tail[1], pv.tail[2]); }
    for (const p of R.parts) {
      const sl = p.slot[i];
      if (sl < 0) continue;
      const ch = p.chunks[p.cm[i]];
      const o = (sl - ch.first) * 16;
      if (p.pivot) {
        child(PV, 1, 0, 0, 0, 1, 0, 0, 0, 1, p.pivot[0], p.pivot[1] + signBob, p.pivot[2]);
        put(ch.arr, o, PV);
      } else put(ch.arr, o, p.anim === 'body' ? B : Wm[p.anim]);
    }
  }

  // Everyone starts in their rest pose; bounds are computed once from it.
  for (const R of kinds) {
    for (let i = 0; i < R.n; i++) pose(R, i, false, 0, 0);
    for (const p of R.parts) for (const ch of p.chunks) {
      ch.mesh.instanceMatrix.needsUpdate = true;
      ch.mesh.computeBoundingSphere();
      ch.mesh.boundingSphere.radius += 3; // room for bobbing / raised arms
    }
  }

  const lowerBound = (arr, val) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < val) lo = mid + 1; else hi = mid; }
    return lo;
  };

  // ---------- camera flashes ----------
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const flashMesh = new THREE.InstancedMesh(
    own(new THREE.PlaneGeometry(1, 1)),
    own(new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
    MAX_FLASH,
  );
  flashMesh.frustumCulled = false;
  flashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const flashes = Array.from({ length: MAX_FLASH }, () => ({ life: 0, max: 0.15, x: 0, y: 0, z: 0, size: 1 }));
  for (let i = 0; i < MAX_FLASH; i++) { flashMesh.setMatrixAt(i, zero); flashMesh.setColorAt(i, col.set('#ffffff')); }
  root.add(flashMesh);
  let flashAcc = 0;
  let flashI = 0;
  const spawnFlash = (fx) => {
    for (let tries = 0; tries < 4; tries++) {
      const R = kinds[Math.floor(Math.random() * kinds.length)];
      const a = lowerBound(R.x, fx - 28);
      const b = lowerBound(R.x, fx + 55);
      if (b <= a) continue;
      const i = a + Math.floor(Math.random() * (b - a));
      if (R.def.noArms) continue;
      const f = flashes[flashI++ % MAX_FLASH];
      f.life = f.max = 0.1 + Math.random() * 0.12;
      f.x = R.x[i] + 0.2;
      f.y = R.y[i] + R.def.headY * R.s[i] + 0.1;
      f.z = R.z[i] + 0.45;
      f.size = 0.9 + Math.random() * 1.1;
      return;
    }
  };

  const api = {
    update(dt, t, focus) {
      const fx = focus.x;
      timeU.value = t;
      focusU.value = fx;
      const target = focus.airborne ? 1 : 0;
      hype += (target - hype) * Math.min(1, dt * (target > hype ? 5 : 1.2));

      for (const R of kinds) {
        const a = lowerBound(R.x, fx - LIVE_BACK);
        const b = lowerBound(R.x, fx + LIVE_AHEAD);
        const lo = R.pb > R.pa ? Math.min(a, R.pa) : a;
        const hi = R.pb > R.pa ? Math.max(b, R.pb) : b;
        R.pa = a;
        R.pb = b;
        if (hi <= lo) continue;
        for (let i = lo; i < hi; i++) pose(R, i, i >= a && i < b, t, fx);
        for (const p of R.parts) {
          const s0 = p.pre[lo];
          const s1 = p.pre[hi];
          if (s1 <= s0) continue;
          for (const ch of p.chunks) {
            const c0 = Math.max(s0, ch.first);
            const c1 = Math.min(s1, ch.first + ch.count);
            if (c1 <= c0) continue;
            const attr = ch.mesh.instanceMatrix;
            attr.clearUpdateRanges();
            attr.addUpdateRange((c0 - ch.first) * 16, (c1 - c0) * 16);
            attr.needsUpdate = true;
          }
        }
      }
      if (mats.holo) mats.holo.opacity = 0.42 + 0.12 * Math.sin(t * 23) + (Math.random() < 0.04 ? -0.25 : 0);

      // Camera flashes pop randomly, far more while the player is in the air.
      flashAcc += dt * (3 + hype * 45 + (focus.excitement || 0) * 4);
      while (flashAcc >= 1) { flashAcc -= 1; spawnFlash(fx); }
      for (let i = 0; i < MAX_FLASH; i++) {
        const f = flashes[i];
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) { flashMesh.setMatrixAt(i, zero); continue; }
        const k = f.life / f.max;
        const sz = f.size * (0.4 + 0.6 * k);
        flashMesh.setMatrixAt(i, m4.compose(v.set(f.x, f.y, f.z), q.identity(), sc.set(sz, sz, sz)));
      }
      flashMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      for (const x of trash) x.dispose?.();
    },
    // for debugging / tests
    stats: () => ({ total: people.length, kinds: Object.fromEntries(kinds.map((R) => [R.id, R.n])), meshes: kinds.reduce((a, R) => a + R.parts.reduce((b, p) => b + p.chunks.length, 0), 0) }),
  };
  return api;
}
