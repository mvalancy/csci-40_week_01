// Animated critters per `ctx.biome.wildlife`. Each species is a rig of a few
// bones (see wildlife-rigs.js) drawn with one InstancedMesh per bone, so a
// whole flock is a handful of draw calls. Animals live in groups that spawn in
// a window around the player and are recycled ahead of it as it advances.
// Ground critters stay off the track (far side z < -8.6, foreground z > 9.3);
// only things in the air may cross over it.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { RIGS, buildBoneGeometry, rockGeometry } from './wildlife-rigs.js';

const TAU = Math.PI * 2;
const FAR_Z = -8.6; // far-side ground critters stay below this z
const NEAR_Z = 9.3; // foreground ground critters stay above this z
const WORLD_MIN = -60;
const WORLD_MAX = 1260;
const GRAV = 16;

// Species tuning. kind: walker | flock | soar | hover | swarm
const CFG = {
  pigeon: { kind: 'flock', groups: 4, per: 8, size: 2.1, far: [-9, -10.8], near: [9.8, 12.5], nearP: 0.6, spread: [3.2, 1.6],
    tints: ['#9aa3b0', '#b8bec8', '#7d8694', '#d8d2c8', '#6f7580', '#a89a90'], fear: 15, flapRate: 26, cruise: [9, 14] },
  dog: { kind: 'walker', special: 'dog', groups: 3, per: 1, size: 1.45, far: [-9, -10.6], near: [10, 12], nearP: 0.85,
    tints: ['#c8924f', '#f2ede4', '#6b4a33', '#d9b27a', '#4a403a'], walk: 1.6, run: 13, fear: 0 },
  vulture: { kind: 'soar', groups: 2, per: 3, size: 2.3, far: [-13, -22], y: [9.5, 12.5], radius: [4, 8], omega: 0.5 },
  roadrunner: { kind: 'walker', special: 'roadrunner', groups: 3, per: 1, size: 1.9, far: [-9, -10.8], near: [10, 12], nearP: 0.6,
    walk: 1.6, run: 22, fear: 17 },
  lizard: { kind: 'walker', special: 'lizard', groups: 4, per: 1, size: 2.2, far: [-9.4, -10.8], near: [10.2, 12.5], nearP: 0.55, perch: [1.1, 1.6],
    tints: ['#6fae4a', '#c9a24a', '#4f8fb0', '#b8643a'], walk: 2.5, run: 9, fear: 14, rock: '#a86a3c' },
  camel: { kind: 'walker', special: 'camel', groups: 2, per: 2, size: 1.3, far: [-9.6, -10.6], near: [12.5, 14], nearP: 1, spread: [7, 1], walk: 1.3, run: 2, fear: 0 },
  goat: { kind: 'walker', special: 'goat', groups: 3, per: 2, size: 1.5, far: [-9.6, -10.8], near: [10.5, 12.5], nearP: 0.45, spread: [5, 1], perch: [1.3, 2.2],
    walk: 1.1, run: 7, fear: 16, rock: '#8a8e98', hopV: 6 },
  eagle: { kind: 'soar', groups: 2, per: 1, size: 2.5, far: [-11, -20], y: [9, 12], radius: [6, 10], omega: 0.45 },
  penguin: { kind: 'walker', special: 'penguin', groups: 3, per: 4, size: 1.4, far: [-9, -10.8], near: [10, 12.5], nearP: 0.6,
    spread: [2.6, 1.4], walk: 0.9, run: 8, fear: 15 },
  rabbit: { kind: 'walker', loco: 'hop', groups: 4, per: 1, size: 1.8, far: [-9, -10.8], near: [10, 12.5], nearP: 0.65,
    tints: ['#ffffff', '#f4f1ea', '#e8e4dc'], walk: 2.5, run: 9, fear: 15, hopV: 4, fleeHopV: 5.5 },
  drone: { kind: 'hover', groups: 3, per: 1, size: 1.6 },
  cat: { kind: 'walker', special: 'cat', groups: 4, per: 1, size: 1.6, far: [-9, -10.8], near: [10, 12], nearP: 0.55,
    tints: ['#2a2a33', '#e08a3a', '#8c8c96', '#f0ece4', '#5a4a3a'], walk: 1.2, run: 10, fear: 15 },
  bat: { kind: 'swarm', groups: 2, per: 10, size: 1.5, far: [-10, -16], y: [5, 8.5], amp: [3, 1.2, 1.8], freq: [1.6, 3.2], flapRate: 24, drift: 3, fear: 16 },
  parrot: { kind: 'flock', groups: 3, per: 7, size: 2.0, far: [-9, -10.8], near: [9.8, 12.5], nearP: 0.55, spread: [3, 1.4],
    tints: ['#e8322a', '#2a7de8', '#2fc24a', '#f5c21b', '#ff7a1a', '#19c2c2'], fear: 16, flapRate: 22, cruise: [8, 13] },
  monkey: { kind: 'walker', special: 'monkey', loco: 'hop', groups: 4, per: 1, size: 1.7, far: [-9, -10.8], near: [10, 12], nearP: 0.45,
    walk: 3, run: 8, fear: 16, hopV: 6.5, fleeHopV: 8 },
  frog: { kind: 'walker', loco: 'hop', groups: 4, per: 2, size: 2.2, far: [-9, -10.8], near: [10, 12.5], nearP: 0.75, spread: [1.6, 0.8],
    tints: ['#4fbf3a', '#8fd14a', '#2f9a55', '#e0d03a'], walk: 2, run: 5.5, fear: 13, hopV: 3.5, fleeHopV: 5 },
  butterfly: { kind: 'swarm', groups: 3, per: 7, size: 2.0, far: [-9.4, -11], near: [10, 12.5], nearP: 0.6, y: [1.6, 3.2],
    amp: [1.3, 0.7, 0.8], freq: [0.5, 1.2], flapRate: 16, drift: 0.6, fear: 14, lowFlyer: true,
    tints: ['#ff8a1a', '#3ac8ff', '#ffe040', '#ff5ab0', '#b070ff', '#f4f4f4'] },
};

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, rate) => v + (t - v) * Math.min(1, rate);
const angLerp = (a, b, k) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * Math.min(1, k);
};

export function createWildlife(ctx) {
  if (typeof location !== 'undefined' && location.search.includes('nowild')) return { update() {}, dispose() {} }; // TEMP
  const { scene, biome } = ctx;
  const R = mulberry32(((ctx.rng ? ctx.rng() : 0.5) * 1e9) | 0);
  const rr = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const root = new THREE.Group();
  root.name = 'wildlife';
  scene.add(root);

  const disposables = [];
  const night = !!biome.night;

  // Lambert with emissive scaled by vertex colour, so critters read at night
  // without flattening their colours.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: night ? 0.42 : 0.06 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;');
  };
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: night ? 0.2 : 0.26, depthWrite: false });
  disposables.push(mat, glowMat, shadowMat);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const M = new THREE.Matrix4();
  const MR = new THREE.Matrix4();
  const MP = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const V = new THREE.Vector3();
  const S = new THREE.Vector3();
  const WHITE = new THREE.Color('#ffffff');

  // ---------- species setup ----------
  const species = [];
  let totalAnimals = 0;
  const DBGLIST = typeof location !== 'undefined' && new URLSearchParams(location.search).get('wildlist'); // TEMP
  for (const id of DBGLIST ? DBGLIST.split(',') : biome.wildlife || []) {
    const cfg = CFG[id];
    const rig = RIGS[id];
    if (!cfg || !rig) continue;
    const n = cfg.groups * cfg.per;
    const bones = rig.bones.map((b) => {
      const geo = buildBoneGeometry(b.prims);
      disposables.push(geo);
      const mesh = new THREE.InstancedMesh(geo, b.glow ? glowMat : mat, n);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, ZERO);
      if (b.tint) for (let i = 0; i < n; i++) mesh.setColorAt(i, WHITE);
      root.add(mesh);
      return { def: b, mesh, at: new THREE.Vector3().fromArray(b.at) };
    });
    const P = {};
    for (const b of rig.bones) P[b.name] = { rx: 0, ry: 0, rz: 0, ox: 0, oy: 0, oz: 0, s: 1, sy: 1 };
    let rocks = null;
    if (cfg.perch) {
      const geo = rockGeometry();
      disposables.push(geo);
      const rm = new THREE.MeshLambertMaterial({ color: cfg.rock, flatShading: true, emissive: cfg.rock, emissiveIntensity: night ? 0.3 : 0.05 });
      disposables.push(rm);
      rocks = new THREE.InstancedMesh(geo, rm, n);
      rocks.frustumCulled = false;
      for (let i = 0; i < n; i++) rocks.setMatrixAt(i, ZERO);
      root.add(rocks);
    }
    const sp = { id, cfg, rig, bones, P, rocks, animals: [], groups: [], shadowBase: totalAnimals };
    for (let gi = 0; gi < cfg.groups; gi++) {
      const g = { i: gi, members: [], x: 0, z: 0, side: -1, active: false, scared: false, dormant: false };
      for (let k = 0; k < cfg.per; k++) {
        const a = { idx: sp.animals.length, k, g, tint: new THREE.Color(), seed: R() * 100 };
        g.members.push(a);
        sp.animals.push(a);
      }
      sp.groups.push(g);
    }
    totalAnimals += n;
    species.push(sp);
  }

  const shadowGeo = new THREE.CircleGeometry(0.5, 14);
  shadowGeo.rotateX(-Math.PI / 2);
  disposables.push(shadowGeo);
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, Math.max(1, totalAnimals));
  shadows.frustumCulled = false;
  shadows.renderOrder = -1;
  for (let i = 0; i < shadows.count; i++) shadows.setMatrixAt(i, ZERO);
  root.add(shadows);

  // ---------- spawning ----------
  function resetAnimal(a) {
    Object.assign(a, {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, state: 'idle', timer: rr(0.5, 3),
      phase: R() * TAU, gait: 0, air: 0, flap: R() * TAU, flapAmp: 0, dihedral: 0, look: 0, peck: 0, sit: 0,
      happy: 0, bark: 0, blink: 0, scratch: false, slide: 0, pushups: 0, t: R() * 10, calm: 0, speed: 0,
      ground: 0, hopWait: 0, flip: 0, airT: 0, airDur: 1, delay: -1, cool: 0, tx: 0, tz: 0, hidden: false,
    });
  }

  function spawnGroup(sp, g, x) {
    const { cfg } = sp;
    if (x > WORLD_MAX - 8 || x < WORLD_MIN) { g.dormant = true; g.active = false; hideGroup(sp, g); return; }
    g.dormant = false;
    g.active = true;
    g.scared = false;
    g.side = cfg.near && R() < (cfg.nearP || 0) ? 1 : -1;
    const band = g.side > 0 ? cfg.near : cfg.far;
    g.x = x;
    g.z = band ? rr(band[0], band[1]) : -10;
    g.band = band;
    g.t = 0;
    g.scatter = 0;
    const [spx, spz] = cfg.spread || [1.5, 1];
    if (cfg.kind === 'soar') {
      g.cx = x; g.cy = rr(cfg.y[0], cfg.y[1]); g.cz = g.z; g.theta = R() * TAU; g.dir = R() < 0.5 ? 1 : -1;
      g.r = rr(cfg.radius[0], cfg.radius[1]); g.climb = 0;
    }
    if (cfg.kind === 'swarm') { g.cx = x; g.cy = rr(cfg.y[0], cfg.y[1]); g.cz = g.z; }
    for (const a of g.members) {
      resetAnimal(a);
      a.size = cfg.size * rr(0.88, 1.12);
      a.tint.set(cfg.tints ? pick(cfg.tints) : '#ffffff');
      if (cfg.kind === 'flock' || cfg.kind === 'walker') {
        a.x = g.x + (g.members.length > 1 ? (R() - 0.5) * spx : 0);
        a.z = g.z + (g.members.length > 1 ? (R() - 0.5) * spz : 0);
        a.z = g.side > 0 ? Math.max(a.z, NEAR_Z + 0.2) : Math.min(a.z, FAR_Z - 0.2);
        a.yaw = R() < 0.5 ? rr(-0.6, 0.6) : Math.PI + rr(-0.6, 0.6);
        a.tx = a.x; a.tz = a.z;
      }
      if (cfg.perch) {
        a.rock = { x: a.x, z: a.z, s: rr(cfg.perch[0], cfg.perch[1]) };
        a.rock.top = a.rock.s * 0.82;
        a.ground = a.rock.top;
        a.x += rr(-0.2, 0.2) * a.rock.s;
      }
      a.y = a.ground;
      if (cfg.kind === 'swarm') {
        a.f = [rr(cfg.freq[0], cfg.freq[1]), rr(cfg.freq[0], cfg.freq[1]), rr(cfg.freq[0], cfg.freq[1])];
        a.ph = [R() * TAU, R() * TAU, R() * TAU];
        a.air = 1;
        a.x = g.cx; a.y = g.cy; a.z = g.cz;
      }
      if (cfg.kind === 'soar') { a.air = 1; a.dihedral = 0.14; a.flapAmp = 0.1; }
      if (sp.id === 'camel') { a.state = 'walk'; a.dirX = R() < 0.5 ? 1 : -1; }
      if (sp.id === 'cat') a.sit = 1;
      if (sp.id === 'dog' && R() < 0.5) a.sit = 1;
      if (sp.id === 'lizard') a.pushups = 1;
    }
    if (sp.rocks) for (const a of g.members) {
      M.compose(V.set(a.rock.x, 0, a.rock.z), Q.setFromEuler(E.set(0, a.seed, 0)), S.set(a.rock.s, a.rock.s, a.rock.s));
      sp.rocks.setMatrixAt(a.idx, M);
    }
    if (sp.rocks) sp.rocks.instanceMatrix.needsUpdate = true;
    // tint colours
    for (const b of sp.bones) if (b.def.tint) {
      for (const a of g.members) b.mesh.setColorAt(a.idx, a.tint);
      b.mesh.instanceColor.needsUpdate = true;
    }
  }

  function hideGroup(sp, g) {
    for (const a of g.members) {
      a.hidden = true;
      for (const b of sp.bones) b.mesh.setMatrixAt(a.idx, ZERO);
      shadows.setMatrixAt(sp.shadowBase + a.idx, ZERO);
      if (sp.rocks) sp.rocks.setMatrixAt(a.idx, ZERO);
    }
  }

  // ---------- threat ----------
  const threat = { d: 1e9, x: 0, z: 0, speed: 0, dx: 0 };
  function nearestRider(x, z, focus) {
    threat.d = 1e9;
    const list = focus.riders && focus.riders.length ? focus.riders : [focus];
    for (const r of list) {
      const d = Math.hypot(r.x - x, (r.z - z) * 0.45);
      if (d < threat.d) { threat.d = d; threat.x = r.x; threat.z = r.z; threat.dx = r.x - x; }
    }
    return threat;
  }

  // ---------- behaviours ----------
  function keepSide(a, g) {
    if (a.y > 4.5) return;
    if (g.side > 0) a.z = Math.max(a.z, NEAR_Z);
    else a.z = Math.min(a.z, FAR_Z);
  }

  function groundY(a) {
    if (!a.rock) return 0;
    const d = Math.hypot(a.x - a.rock.x, (a.z - a.rock.z) / 0.85);
    return d < a.rock.s * 0.72 ? a.rock.top : 0;
  }

  function faceVel(a, dt, rate = 8) {
    if (Math.abs(a.vx) + Math.abs(a.vz) > 0.05) a.yaw = angLerp(a.yaw, Math.atan2(-a.vz, a.vx), dt * rate);
  }

  function startFlee(sp, a, g, t) {
    const { cfg } = sp;
    a.state = 'flee';
    a.timer = rr(1.6, 2.6);
    const away = Math.sign(-t.dx) || 1;
    let fx = away * rr(0.4, 0.9) + 0.3;
    let fz = g.side * rr(0.8, 1.2);
    if (sp.id === 'roadrunner') { fx = 1; fz = g.side * 0.12; a.timer = rr(1.8, 2.8); }
    const l = Math.hypot(fx, fz);
    a.fdx = fx / l; a.fdz = fz / l;
    a.sit = 0; a.scratch = false;
    if (sp.id === 'penguin') { a.state = 'slide'; a.speed = cfg.run; a.timer = 0; }
    g.scared = true;
  }

  function stepWalker(sp, a, g, dt, time, focus) {
    const { cfg, id } = sp;
    a.t += dt;
    a.timer -= dt;
    a.calm -= dt;
    a.cool -= dt;
    const th = nearestRider(a.x, a.z, focus);

    // dog: chase riders instead of fleeing
    if (id === 'dog') {
      if (a.state !== 'chase' && a.cool <= 0 && th.dx < 4 && th.dx > -14 && Math.abs(th.z - a.z) < 20) {
        a.state = 'chase'; a.timer = rr(2.2, 3.4); a.sit = 0; a.cool = 9;
        a.chaseSpeed = clamp((focus.speed || 10) * 0.75, 8, 20);
      }
    } else if (cfg.fear && th.d < cfg.fear && a.calm <= 0 && a.state !== 'flee' && a.state !== 'slide') {
      startFlee(sp, a, g, th);
    } else if (g.scared && a.state !== 'flee' && a.state !== 'slide' && a.calm <= 0 && cfg.per > 1 && a.delay < 0) {
      a.delay = rr(0.05, 0.4);
    }
    if (a.delay >= 0) {
      a.delay -= dt;
      if (a.delay < 0 && a.state !== 'flee' && a.state !== 'slide') startFlee(sp, a, g, th);
    }

    let want = 0; // desired speed
    let dx = 0;
    let dz = 0;
    switch (a.state) {
      case 'idle': {
        if (id === 'camel') { a.state = 'walk'; break; }
        a.peck = (id === 'goat' || id === 'rabbit') ? Math.max(0, Math.sin(a.t * 1.3 + a.seed)) : 0;
        if (Math.sin(a.t * 0.7 + a.seed) > 0.95) a.look = Math.sin(a.t * 3) * 0.6;
        else a.look = approach(a.look, 0, dt * 3);
        if (id === 'monkey') a.scratch = Math.sin(a.t * 0.9 + a.seed) > 0.6;
        if (id === 'dog') a.sit = approach(a.sit, a.sitWant ?? 1, dt * 4);
        if (a.timer < 0) {
          a.state = 'walk';
          const r = a.rock ? a.rock.s * 0.45 : id === 'monkey' ? 5 : 3;
          a.tx = (a.rock ? a.rock.x : a.x) + rr(-r, r);
          a.tz = (a.rock ? a.rock.z : a.z) + rr(-r, r) * 0.5;
          a.timer = rr(2, 5);
          a.sitWant = R() < 0.5 ? 1 : 0;
          a.sit = 0;
        }
        break;
      }
      case 'walk': {
        if (id === 'camel') {
          want = cfg.walk; dx = a.dirX; dz = Math.sin(a.t * 0.2 + a.seed) * 0.15;
          a.peck = 0.15;
          break;
        }
        const ex = a.tx - a.x;
        const ez = a.tz - a.z;
        const d = Math.hypot(ex, ez);
        if (d < 0.25 || a.timer < 0) { a.state = 'idle'; a.timer = rr(1.2, 4); break; }
        want = cfg.walk; dx = ex / d; dz = ez / d;
        if (id === 'lizard') want = cfg.walk * (Math.sin(a.t * 6) > 0 ? 1.6 : 0);
        break;
      }
      case 'flee': {
        want = cfg.run; dx = a.fdx; dz = a.fdz;
        if (id === 'cat') a.look = 0;
        if (a.timer < 0) { a.state = 'idle'; a.timer = rr(2, 4); a.calm = 1.5; g.scared = false; }
        break;
      }
      case 'slide': { // penguin belly slide
        a.slide = approach(a.slide, 1, dt * 7);
        a.speed = Math.max(0, a.speed - dt * 2.2);
        a.vx = a.fdx * a.speed * a.slide; a.vz = a.fdz * a.speed * a.slide;
        a.x += a.vx * dt; a.z += a.vz * dt;
        faceVel(a, dt, 10);
        if (a.speed < 0.6) { a.state = 'getup'; a.timer = 0.6; }
        a.gait = 0;
        break;
      }
      case 'getup': {
        a.slide = approach(a.slide, 0, dt * 5);
        if (a.timer < 0) { a.state = 'idle'; a.timer = rr(1, 3); a.calm = 1; g.scared = false; }
        break;
      }
      case 'chase': { // dog
        want = a.chaseSpeed; dx = 1; dz = 0;
        a.happy = 1;
        a.bark = Math.max(0, Math.sin(a.t * 14));
        if (a.timer < 0) { a.state = 'tired'; a.timer = rr(1, 1.6); }
        break;
      }
      case 'tired': {
        want = 1.2; dx = 1; dz = 0;
        a.bark = 0;
        if (a.timer < 0) { a.state = 'idle'; a.timer = rr(3, 5); a.sitWant = 1; a.happy = 0.3; }
        break;
      }
      default: break;
    }
    if (id === 'roadrunner' && a.state === 'idle' && a.timer < 0.05 && R() < 0.3) {
      // spontaneous dash along the far side
      a.state = 'flee'; a.timer = rr(0.8, 1.4); a.fdx = R() < 0.6 ? 1 : -1; a.fdz = 0;
    }

    // locomotion
    const hop = cfg.loco === 'hop' || (id === 'goat' && a.state === 'flee');
    if (a.state !== 'slide' && a.state !== 'getup') {
      if (hop) {
        if (a.air > 0.5) {
          a.vy -= GRAV * dt;
          a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt;
          a.airT += dt;
          if (a.flip) a.pitch = -TAU * clamp(a.airT / a.airDur, 0, 1) * a.flip;
          else a.pitch = clamp(a.vy * 0.07, -0.5, 0.5);
          const gy = groundY(a);
          if (a.y <= gy && a.vy < 0) {
            a.y = gy; a.air = 0; a.vx = a.vz = 0; a.pitch = 0; a.flip = 0;
            a.hopWait = a.state === 'flee' ? rr(0.04, 0.12) : rr(0.25, 0.9);
          }
        } else {
          a.hopWait -= dt;
          a.pitch = approach(a.pitch, 0, dt * 10);
          if (want > 0 && a.hopWait <= 0) {
            const v = a.state === 'flee' ? (cfg.fleeHopV || cfg.hopV || 5) : (cfg.hopV || 4);
            a.vy = v * rr(0.85, 1.1);
            a.airDur = (2 * a.vy) / GRAV;
            a.vx = dx * want; a.vz = dz * want;
            a.air = 1; a.airT = 0;
            a.flip = id === 'monkey' && R() < (a.state === 'flee' ? 0.6 : 0.25) ? (R() < 0.5 ? 1 : -1) : 0;
            faceVel(a, 1, 1);
          }
        }
        a.gait = 0;
      } else {
        const acc = a.state === 'flee' || a.state === 'chase' ? 10 : 4;
        a.speed = approach(a.speed, want, dt * acc);
        a.vx = dx * a.speed; a.vz = dz * a.speed;
        if (want === 0) { a.vx *= 0.8; a.vz *= 0.8; }
        a.x += a.vx * dt; a.z += a.vz * dt;
        faceVel(a, dt, a.state === 'flee' ? 10 : 5);
        const run = a.state === 'flee' || a.state === 'chase';
        a.gait = approach(a.gait, a.speed > 0.2 ? (run ? 1 : 0.6) : 0, dt * 6);
        const stride = (id === 'roadrunner' ? 0.55 : id === 'camel' ? 1.8 : 0.8) * a.size;
        a.phase += dt * (a.speed / stride) * Math.PI;
        const gy = groundY(a);
        a.y = approach(a.y, gy, dt * 14);
        a.pitch = id === 'roadrunner' ? approach(a.pitch, -0.35 * (a.speed / cfg.run), dt * 6) : approach(a.pitch, 0, dt * 6);
        if (id === 'penguin') a.roll = Math.sin(a.phase) * 0.18 * a.gait + Math.sin(a.t * 2 + a.seed) * 0.03;
      }
      if (id === 'dog' && a.sit > 0 && a.state !== 'idle') a.sit = approach(a.sit, 0, dt * 8);
      if (id === 'cat') {
        a.sit = approach(a.sit, a.state === 'idle' ? 1 : 0, dt * 5);
        a.blink = (a.t + a.seed) % 3.5 < 0.12 ? 1 : 0;
      }
    }
    // Penguin slide: tip onto the belly.
    if (id === 'penguin') a.pitch = -Math.PI / 2 * a.slide;
    keepSide(a, g);
  }

  function stepFlock(sp, a, g, dt, time, focus) {
    const { cfg } = sp;
    a.t += dt;
    a.timer -= dt;
    if (a.state !== 'fly') {
      const th = nearestRider(a.x, a.z, focus);
      if (th.d < cfg.fear) g.scared = true;
      if (g.scared && a.delay < 0) { a.delay = rr(0, 0.35); a.fleeDir = Math.sign(-th.dx) || 1; }
      if (a.delay >= 0) {
        a.delay -= dt;
        if (a.delay < 0) {
          a.state = 'fly'; a.air = 1; a.airT = 0;
          const dir = a.fleeDir || 1;
          a.vx = dir * rr(2, 5); a.vy = rr(5, 8); a.vz = g.side * rr(1, 3);
          a.cruise = dir * rr(cfg.cruise[0], cfg.cruise[1]);
          a.flapAmp = 1.1;
          a.delay = -1;
        }
      }
    }
    if (a.state === 'fly') {
      a.airT += dt;
      a.vx = approach(a.vx, a.cruise, dt * 1.5);
      a.vy = approach(a.vy, 2.2, dt * 0.8);
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      const glide = a.airT > 1.2 && Math.sin(a.airT * 2 + a.seed) > 0.4;
      a.flapAmp = approach(a.flapAmp, glide ? 0.15 : 1.05, dt * 6);
      a.flap += dt * cfg.flapRate * (glide ? 0.3 : 1);
      a.yaw = angLerp(a.yaw, Math.atan2(-a.vz, a.vx), dt * 6);
      a.pitch = clamp(Math.atan2(a.vy, Math.abs(a.vx) + 0.1) * 0.6, -0.4, 0.6);
      a.roll = Math.sin(a.airT * 3 + a.seed) * 0.15;
      if (a.airT > 9) a.hidden = true;
      return;
    }
    // on the ground: peck, strut, turn
    a.air = 0;
    a.flapAmp = 0;
    if (a.state === 'idle') {
      a.peck = Math.pow(Math.max(0, Math.sin(a.t * 5 + a.seed)), 3) * (Math.sin(a.t * 0.8 + a.seed) > 0 ? 1 : 0);
      a.gait = approach(a.gait, 0, dt * 6);
      if (a.timer < 0) {
        a.state = 'walk'; a.timer = rr(0.6, 1.6);
        const ang = R() * TAU;
        a.vx = Math.cos(ang) * 0.7; a.vz = Math.sin(ang) * 0.35;
      }
    } else {
      a.peck = 0;
      a.x += a.vx * dt; a.z += a.vz * dt;
      a.gait = approach(a.gait, 1, dt * 6);
      a.phase += dt * 14;
      faceVel(a, dt, 8);
      if (a.timer < 0) { a.state = 'idle'; a.timer = rr(0.8, 3); }
    }
    a.y = Math.abs(Math.sin(a.phase)) * 0.04 * a.gait;
    keepSide(a, g);
  }

  function stepSoar(sp, a, g, dt, time, focus, k) {
    const { cfg } = sp;
    a.t += dt;
    const n = g.members.length;
    const th = a.k * (TAU / n) + g.theta;
    const r = g.r * (1 + a.k * 0.15);
    const nx = g.cx + Math.cos(th) * r;
    const nz = g.cz + Math.sin(th) * r * 0.55;
    const ny = g.cy + a.k * 0.9 + Math.sin(th * 2 + a.seed) * 0.4 + g.climb;
    a.vx = (nx - a.x) / Math.max(dt, 1e-3); a.vz = (nz - a.z) / Math.max(dt, 1e-3);
    if (a.t < 0.05) { a.vx = -Math.sin(th) * g.dir; a.vz = Math.cos(th) * g.dir; }
    a.x = nx; a.y = ny; a.z = nz;
    faceVel(a, dt, 6);
    a.roll = -0.4 * g.dir;
    a.pitch = Math.sin(th * 2) * 0.08;
    // mostly gliding with the odd lazy flap burst
    const burst = Math.sin(a.t * 0.9 + a.seed * 3) > 0.75 || g.climbing;
    a.flapAmp = approach(a.flapAmp, burst ? 0.6 : 0.06, dt * 3);
    a.dihedral = approach(a.dihedral, burst ? 0 : 0.16, dt * 3);
    a.flap += dt * (burst ? 7 : 2);
  }

  function stepGroupSoar(sp, g, dt, focus) {
    g.theta += dt * sp.cfg.omega * g.dir;
    g.cx += dt * 2.2;
    const th = nearestRider(g.cx, g.cz, focus);
    g.climbing = (focus.airborne && th.d < 18) || g.climbing && g.climb < 3;
    if (g.climbing) g.climb = Math.min(4, g.climb + dt * 2);
    else g.climb = Math.max(0, g.climb - dt * 0.3);
  }

  function stepSwarm(sp, a, g, dt, time) {
    const { cfg } = sp;
    const [ax, ay, az] = cfg.amp;
    const k = 1 + g.scatter * 2.2;
    const tt = time;
    const nx = g.cx + (Math.sin(tt * a.f[0] + a.ph[0]) + 0.4 * Math.sin(tt * a.f[1] * 2.3 + a.ph[1])) * ax * k;
    let ny = g.cy + Math.sin(tt * a.f[1] + a.ph[1]) * ay * k + g.scatter * 3 * (0.5 + (a.k % 3) * 0.3);
    let nz = g.cz + Math.sin(tt * a.f[2] + a.ph[2]) * az * k + g.scatter * g.side * 2;
    if (cfg.lowFlyer) {
      ny = Math.max(0.4, ny);
      if (ny < 4.5) nz = g.side > 0 ? Math.max(nz, NEAR_Z) : Math.min(nz, FAR_Z);
    }
    a.vx = (nx - a.x) / Math.max(dt, 1e-3); a.vz = (nz - a.z) / Math.max(dt, 1e-3);
    const vy = (ny - a.y) / Math.max(dt, 1e-3);
    a.x = nx; a.y = ny; a.z = nz;
    faceVel(a, dt, 10);
    a.pitch = clamp(vy * 0.05, -0.5, 0.5);
    a.roll = clamp(a.vz * 0.05, -0.5, 0.5);
    a.flap += dt * cfg.flapRate * (1 + g.scatter * 0.6) * (0.85 + 0.3 * Math.sin(a.seed + time * 3));
  }

  function stepGroupSwarm(sp, g, dt, focus) {
    const { cfg } = sp;
    g.cx += dt * cfg.drift;
    const th = nearestRider(g.cx, g.cz, focus);
    if (th.d < cfg.fear) g.scatter = Math.min(1, g.scatter + dt * 4);
    else g.scatter = Math.max(0, g.scatter - dt * 0.3);
  }

  // Drones follow the race leader like a TV crew.
  function stepHover(sp, a, g, dt, time, focus) {
    let lead = focus;
    for (const r of focus.riders || []) if (r.x > lead.x) lead = r;
    const offs = [-3, 7, 16];
    const tx = lead.x + offs[a.idx % 3];
    const ty = (lead.y || 0) + 5.2 + (a.idx % 3) * 0.9 + Math.sin(time * 1.3 + a.seed) * 0.35;
    const tz = -9.2 - (a.idx % 3) * 1.4 + Math.sin(time * 0.7 + a.seed) * 0.5;
    if (!a.init || Math.abs(a.x - tx) > 120) {
      a.init = true; a.x = tx; a.y = ty; a.z = tz; a.vx = a.vy = a.vz = 0;
    }
    const kS = 5;
    const c = 2 * Math.sqrt(kS);
    const ax = (tx - a.x) * kS - a.vx * c;
    a.vx += ax * dt; a.vy += ((ty - a.y) * kS - a.vy * c) * dt; a.vz += ((tz - a.z) * kS - a.vz * c) * dt;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    a.yaw = angLerp(a.yaw, Math.atan2(-(lead.z - a.z), lead.x - a.x), dt * 4);
    // tilt into the direction of travel (converted into the drone's own frame)
    const fwd = a.vx * Math.cos(a.yaw) - a.vz * Math.sin(a.yaw);
    const side = a.vx * Math.sin(a.yaw) + a.vz * Math.cos(a.yaw);
    a.pitch = approach(a.pitch, -clamp(fwd * 0.012, -0.45, 0.45), dt * 5);
    a.roll = approach(a.roll, clamp(side * 0.012, -0.45, 0.45), dt * 5);
    a.t += dt;
  }

  // ---------- drawing ----------
  function draw(sp, a, time) {
    const { bones, P, rig } = sp;
    if (a.hidden) {
      for (const b of bones) b.mesh.setMatrixAt(a.idx, ZERO);
      shadows.setMatrixAt(sp.shadowBase + a.idx, ZERO);
      return;
    }
    for (const b of bones) {
      const q = P[b.def.name];
      q.rx = q.ry = q.rz = q.ox = q.oy = q.oz = 0; q.s = 1; q.sy = 1;
    }
    rig.pose(a, P, time);
    E.set(a.roll, a.yaw, a.pitch, 'YZX');
    Q.setFromEuler(E);
    let lift = 0;
    if (sp.id === 'penguin') lift = a.slide * 0.24;
    MR.compose(V.set(a.x, a.y + lift * a.size, a.z), Q, S.set(a.size, a.size, a.size));
    for (const b of bones) {
      const q = P[b.def.name];
      E.set(q.rx, q.ry, q.rz, 'XYZ');
      Q.setFromEuler(E);
      MP.compose(V.set(b.at.x + q.ox, b.at.y + q.oy, b.at.z + q.oz), Q, S.set(q.s, q.s * q.sy, q.s));
      M.multiplyMatrices(MR, MP);
      b.mesh.setMatrixAt(a.idx, M);
    }
    // blob shadow
    const kind = sp.cfg.kind;
    const gy = a.rock ? groundY(a) : 0;
    const h = a.y - gy;
    if (kind === 'hover' || kind === 'soar' || h > 6) {
      shadows.setMatrixAt(sp.shadowBase + a.idx, ZERO);
    } else {
      const base = { camel: 1.5, penguin: 0.55, dog: 0.9, goat: 0.85, cat: 0.65, monkey: 0.55, butterfly: 0.25 }[sp.id] || 0.5;
      const s = a.size * base * (1 - h / 7);
      M.compose(V.set(a.x, gy + 0.03, a.z), Q.identity(), S.set(s * 1.3, 1, s));
      shadows.setMatrixAt(sp.shadowBase + a.idx, M);
    }
  }

  // ---------- main loop ----------
  let started = false;
  const ANIM_AHEAD = 95;
  const BEHIND = 38;

  const DBG = typeof location !== 'undefined' && location.search.includes('wilddebug'); // TEMP
  function initAll(fx) {
    for (const sp of species) {
      const n = sp.groups.length;
      sp.groups.forEach((g, i) => spawnGroup(sp, g, DBG ? fx + 2 + ((i + 0.5) / n) * 36 : fx - 25 + ((i + 0.2 + R() * 0.6) / n) * 150));
    }
  }

  function update(dt, time, focus) {
    if (!species.length) return;
    dt = dt > 0 ? Math.min(dt, 0.05) : 0; // the game clock can hiccup backwards
    const fx = focus.x || 0;
    if (!started) { started = true; initAll(fx); }
    for (const sp of species) {
      const { cfg } = sp;
      for (const g of sp.groups) {
        // recycle
        if (cfg.kind !== 'hover') {
          const anchor = cfg.kind === 'soar' || cfg.kind === 'swarm' ? g.cx : null;
          let gone = true;
          if (anchor != null) gone = anchor < fx - BEHIND - 10 || anchor > fx + 220;
          else for (const a of g.members) {
            if (!(a.hidden || a.x < fx - BEHIND || a.x > fx + 220 || a.y > 40 || a.z < -70 || a.z > 40)) { gone = false; break; }
          }
          if (g.dormant) {
            const x = fx + rr(50, 120);
            if (x < WORLD_MAX - 8) spawnGroup(sp, g, x);
            continue;
          }
          if (gone) {
            const jumpedBack = g.members.some((a) => a.x > fx + 220) || (anchor != null && anchor > fx + 220);
            spawnGroup(sp, g, jumpedBack ? fx + rr(-20, 130) : fx + rr(50, 130));
            if (g.dormant) continue;
          }
        }
        if (cfg.kind === 'soar') stepGroupSoar(sp, g, dt, focus);
        if (cfg.kind === 'swarm') stepGroupSwarm(sp, g, dt, focus);
        for (const a of g.members) {
          if (cfg.kind !== 'hover' && a.x > fx + ANIM_AHEAD) {
            // parked off-screen ahead: draw once, don't simulate
            if (!a.drawn) { draw(sp, a, time); a.drawn = true; }
            continue;
          }
          a.drawn = false;
          if (cfg.kind === 'walker') stepWalker(sp, a, g, dt, time, focus);
          else if (cfg.kind === 'flock') stepFlock(sp, a, g, dt, time, focus);
          else if (cfg.kind === 'soar') stepSoar(sp, a, g, dt, time, focus);
          else if (cfg.kind === 'swarm') stepSwarm(sp, a, g, dt, time);
          else if (cfg.kind === 'hover') stepHover(sp, a, g, dt, time, focus);
          draw(sp, a, time);
        }
      }
      for (const b of sp.bones) b.mesh.instanceMatrix.needsUpdate = true;
      if (sp.rocks) sp.rocks.instanceMatrix.needsUpdate = true;
    }
    shadows.instanceMatrix.needsUpdate = true;
  }

  // Drones exist from the start (they have no groups to recycle).
  for (const sp of species) if (sp.cfg.kind === 'hover') for (const g of sp.groups) {
    g.active = true; g.side = -1;
    for (const a of g.members) { resetAnimal(a); a.size = sp.cfg.size; a.air = 1; }
  }

  function dispose() {
    scene.remove(root);
    root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    for (const d of disposables) d.dispose();
    species.length = 0;
  }

  if (DBG) window.__wild = { species, ctx }; // TEMP
  return { update, dispose, group: root };
}
