// Six distinct bikes + riders built from primitives. No model files.
// buildBike(modelId, color, number) -> { root, body, rider, rear, front, flame, extras }
// Wheel centres sit at (±WHEELBASE/2, WHEEL_R) for every model so physics lines up.
import * as THREE from 'three';

export const WHEEL_R = 0.55;
export const WHEELBASE = 1.9;
const RX = -WHEELBASE / 2;
const FX = WHEELBASE / 2;
const PI = Math.PI;

export const BIKE_MODELS = [
  { id: 'dirt', name: 'Mud Hornet', blurb: 'Classic 450 motocrosser. Knobby tyres, long travel, loud.' },
  { id: 'chopper', name: 'Iron Buffalo', blurb: 'Raked-out V-twin chopper with ape hangers and a fat rear boot.' },
  { id: 'sport', name: 'Viper GT', blurb: 'Full-fairing superbike. Tuck in and hold on.' },
  { id: 'hover', name: 'Photon Ghost', blurb: 'Grav-ring hover bike with neon underglow and a glass canopy.' },
  { id: 'mech', name: 'Titan Walker-X', blurb: 'Armoured heavy hauler on tread wheels, piloted by a robot.' },
  { id: 'retro', name: 'Tin Rocket 1950', blurb: 'Retro-futurist bubble-top rocket with tail fins and a big burner.' },
];

// ---------- helpers ----------
// No environment map in the game, so metals are capped to keep a diffuse share.
const std = (color, roughness = 0.5, metalness = 0.2, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: Math.min(0.72, metalness), ...extra });
const glow = (color, intensity = 1.6, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0, ...extra });
const chromeMat = () => std('#eef1f6', 0.18, 1.0);

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
// Same mesh on both sides of the bike (z and -z).
function pair(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  return [mesh(parent, geo, mat, x, y, z, rx, ry, rz), mesh(parent, geo, mat, x, y, -z, -rx, -ry, rz)];
}
// Stretch a unit-height (y) geometry between two xy points.
// A strut that ends on a wheel axle (fork leg, swingarm) is tagged as a
// suspension link: it stays a separate mesh and re-stretches as the wheel moves.
const AXLES = { front: [FX, WHEEL_R], rear: [RX, WHEEL_R] };
const atAxle = (p) => Object.keys(AXLES).find((k) => AXLES[k][0] === p[0] && AXLES[k][1] === p[1]);
function strut(parent, geo, mat, a, b, z = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = mesh(parent, geo, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, 0, 0, Math.atan2(dy, dx) - PI / 2);
  m.scale.y = Math.hypot(dx, dy);
  const end = atAxle(a) || atAxle(b);
  if (end) m.userData.link = { end, anchor: new THREE.Vector3(...(atAxle(a) ? b : a), z), offset: new THREE.Vector3(0, 0, z) };
  return m;
}
const unitCyl = (r, seg = 10) => new THREE.CylinderGeometry(r, r, 1, seg);
// Side-profile silhouette (xy points) extruded symmetrically in z.
function extrude(pts, depth, bevel = 0.02, smooth = false) {
  const v = pts.map(([x, y]) => new THREE.Vector2(x, y));
  const s = new THREE.Shape();
  if (smooth) { s.moveTo(v[0].x, v[0].y); s.splineThru(v.slice(1)); s.closePath(); } else s.setFromPoints(v);
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
// Lathe around the x axis from [x, radius] pairs (x ascending).
function latheX(profile, seg = 24, phiStart = 0, phiLength = PI * 2) {
  const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), seg, phiStart, phiLength);
  g.rotateZ(-PI / 2);
  return g;
}
function tube(points, r, seg = 40) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, 8, false);
}
// Ring of instanced blocks around a wheel (knobs / tread pads).
function ringInstances(geo, mat, n, r, zAlt = 0) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    d.position.set(Math.cos(a) * r, Math.sin(a) * r, i % 2 ? zAlt : -zAlt);
    d.rotation.set(0, 0, a);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  }
  im.castShadow = true;
  im.computeBoundingSphere();
  return im;
}
// Number decal texture. shape: 'plate' | 'round' | 'clear' (transparent bg) | 'stencil'
function numberTex(num, { bg = '#fff', fg = '#111', ring = null, shape = 'plate', font = 'bold 84px system-ui' } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (shape === 'round') {
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 60, 0, PI * 2); g.fill();
    if (ring) { g.lineWidth = 8; g.strokeStyle = ring; g.stroke(); }
  } else if (shape === 'plate') {
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    if (ring) { g.lineWidth = 10; g.strokeStyle = ring; g.strokeRect(5, 5, 118, 118); }
  }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (shape === 'clear' && ring) { g.lineWidth = 10; g.strokeStyle = ring; g.strokeText(num, 64, 70); }
  g.fillStyle = fg; g.fillText(num, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function decalMat(tex, extra = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.5, ...extra });
}
function hazardTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ffc21a'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#15151a';
  for (let x = -32; x < 160; x += 24) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 12, 32); g.lineTo(x + 44, 0); g.lineTo(x + 32, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Turbo flame: a group whose local +y points out of the exhaust; the game
// scales y for flicker and toggles visible.
function makeFlame(parent, x, y, z, angleUp, { len = 0.75, r = 0.13, outer = '#ff7a00', inner = '#fff2a8' } = {}) {
  const flame = new THREE.Group();
  const o = new THREE.ConeGeometry(r, len, 12, 1, true); o.translate(0, len / 2, 0); o.rotateY(PI);
  const i = new THREE.ConeGeometry(r * 0.5, len * 0.6, 10, 1, true); i.translate(0, len * 0.3, 0);
  const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const a = new THREE.Mesh(o, add(outer, 0.85));
  const b = new THREE.Mesh(i, add(inner, 1));
  flame.add(a, b);
  flame.position.set(x, y, z);
  flame.rotation.z = PI / 2 - angleUp;
  flame.visible = false;
  parent.add(flame);
  return flame;
}

// ---------- rider ----------
// pose: 2D joint positions [x, y] for hip, shoulder, head, elbow, hand, knee, foot.
function limbPair(parent, a, b, r, mat, z) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const geo = new THREE.CapsuleGeometry(r, Math.hypot(dx, dy), 4, 8);
  const rz = Math.atan2(dy, dx) - PI / 2;
  return pair(parent, geo, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, 0, 0, rz);
}

function buildRider(o) {
  const g = new THREE.Group();
  const p = o.pose;
  const suit = o.suit, pants = o.pants || suit, boots = o.boots || std('#1a1a1f', 0.6);
  const extras = [];
  // torso
  const tdx = p.shoulder[0] - p.hip[0], tdy = p.shoulder[1] - p.hip[1];
  const tl = Math.hypot(tdx, tdy), ta = Math.atan2(tdy, tdx) - PI / 2;
  const tmx = (p.hip[0] + p.shoulder[0]) / 2, tmy = (p.hip[1] + p.shoulder[1]) / 2;
  if (o.robot) {
    const torso = mesh(g, new THREE.BoxGeometry(0.36, tl + 0.05, 0.44), o.metal, tmx, tmy, 0, 0, 0, ta);
    mesh(torso, new THREE.BoxGeometry(0.1, tl * 0.75, 0.4), o.accent, 0.17, 0.06, 0); // chest plate
    pair(g, new THREE.BoxGeometry(0.26, 0.16, 0.2), o.accent, p.shoulder[0], p.shoulder[1] + 0.04, 0.3, 0, 0, ta);
  } else {
    const torso = mesh(g, new THREE.CapsuleGeometry(0.2, tl, 4, 10), o.torso || suit, tmx, tmy, 0, 0, 0, ta);
    torso.scale.z = 1.15;
  }
  limbPair(g, p.shoulder, p.elbow, o.robot ? 0.075 : 0.08, o.arm || suit, 0.27);
  limbPair(g, p.elbow, p.hand, o.robot ? 0.065 : 0.07, o.arm || suit, 0.29);
  limbPair(g, p.hip, p.knee, o.robot ? 0.1 : 0.11, pants, 0.19);
  limbPair(g, p.knee, p.foot, o.robot ? 0.08 : 0.09, pants, 0.21);
  pair(g, new THREE.BoxGeometry(0.3, 0.14, 0.14), boots, p.foot[0] + 0.07, p.foot[1] - 0.03, 0.21);
  if (o.robot) {
    const j = new THREE.SphereGeometry(0.09, 10, 8);
    pair(g, j, o.eye, p.elbow[0], p.elbow[1], 0.28);
    pair(g, j, o.eye, p.knee[0], p.knee[1], 0.2);
  }

  // head
  const h = new THREE.Group();
  h.position.set(p.head[0], p.head[1], 0);
  h.rotation.z = o.headTilt || 0;
  g.add(h);
  const style = o.head;
  if (style === 'mx') {
    const shell = std('#f3f4f8', 0.25, 0.3);
    mesh(h, new THREE.SphereGeometry(0.245, 18, 14), shell).scale.set(1.08, 1, 1);
    mesh(h, new THREE.TorusGeometry(0.25, 0.035, 6, 24, PI * 1.2), o.accent, 0, 0.02, 0, 0, PI / 2, -0.2);
    mesh(h, new THREE.BoxGeometry(0.34, 0.035, 0.3), o.accent, 0.2, 0.19, 0, 0, 0, -0.25);   // peak
    mesh(h, new THREE.BoxGeometry(0.2, 0.13, 0.24), shell, 0.2, -0.14, 0, 0, 0, 0.35);        // chin bar
    mesh(h, new THREE.BoxGeometry(0.08, 0.11, 0.3), std('#ff8a1a', 0.1, 0.9, { emissive: '#552200' }), 0.23, 0.02, 0); // goggles
  } else if (style === 'full') {
    mesh(h, new THREE.SphereGeometry(0.235, 18, 14), o.accent).scale.set(1.12, 1, 1);
    mesh(h, new THREE.SphereGeometry(0.245, 18, 10, PI - 0.85, 1.7, 1.15, 0.6), o.visor).scale.set(1.12, 1, 1);
    mesh(h, new THREE.BoxGeometry(0.18, 0.05, 0.18), o.trim || o.accent, -0.2, 0.17, 0, 0, 0, 0.35); // spoiler
    mesh(h, new THREE.TorusGeometry(0.238, 0.02, 6, 24, PI), o.trim || shellWhite(), 0, 0, 0, 0, PI / 2, 0);
  } else if (style === 'bandana') {
    const skin = std('#c98d63', 0.7);
    mesh(h, new THREE.SphereGeometry(0.18, 16, 12), skin);
    mesh(h, new THREE.SphereGeometry(0.19, 16, 8, 0, PI * 2, 0, PI / 2), o.accent, 0, 0.02, 0, 0, 0, -0.15);
    mesh(h, new THREE.BoxGeometry(0.16, 0.05, 0.05), o.accent, -0.23, 0.02, 0, 0, 0, -0.5); // knot tail
    mesh(h, new THREE.BoxGeometry(0.05, 0.05, 0.3), std('#050505', 0.1, 0.9), 0.17, 0.02, 0);  // shades
    mesh(h, new THREE.SphereGeometry(0.13, 10, 8), std('#5b3a22', 0.95), 0.08, -0.12, 0).scale.set(0.9, 1.1, 1.2); // beard
  } else if (style === 'aviator') {
    const leather = std('#6b4228', 0.7);
    mesh(h, new THREE.SphereGeometry(0.17, 16, 12), std('#e0a883', 0.7));
    mesh(h, new THREE.SphereGeometry(0.182, 16, 10, 0, PI * 2, 0, PI * 0.62), leather, -0.02, 0, 0, 0, 0, 0.3);
    pair(h, new THREE.CylinderGeometry(0.055, 0.055, 0.06, 12), std('#8fd8ff', 0.05, 0.6, { emissive: '#113344' }), 0.16, 0.07, 0.07, 0, 0, PI / 2);
    mesh(h, new THREE.TorusGeometry(0.15, 0.045, 8, 20), o.accent, -0.02, -0.2, 0, PI / 2, 0, 0.2); // scarf
    const tail = mesh(h, new THREE.BoxGeometry(0.42, 0.1, 0.03), o.accent, -0.32, -0.2, 0.08, 0, 0, 0.25); // flapping
    tail.name = 'scarf';
  } else if (style === 'robot') {
    mesh(h, new THREE.BoxGeometry(0.34, 0.3, 0.32), o.metal);
    mesh(h, new THREE.BoxGeometry(0.26, 0.07, 0.36), o.accent, -0.04, 0.17, 0);
    mesh(h, new THREE.BoxGeometry(0.1, 0.14, 0.34), std('#16181d', 0.3, 0.5), 0.14, 0.02, 0); // faceplate
    const eye = mesh(h, new THREE.BoxGeometry(0.03, 0.05, 0.3), o.eye, 0.195, 0.04, 0);
    extras.push(eye);
    mesh(h, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), o.metal, -0.1, 0.3, 0.1);
    extras.push(mesh(h, new THREE.SphereGeometry(0.04, 8, 6), o.eye, -0.1, 0.46, 0.1));
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  return { group: g, extras };
}
function shellWhite() { return std('#f3f4f8', 0.25, 0.3); }

// ---------- 1. Mud Hornet (dirt) ----------
function dirtWheel(mats, front) {
  const w = new THREE.Group();
  mesh(w, new THREE.TorusGeometry(0.44, 0.1, 10, 30), mats.rubber);
  w.add(ringInstances(new THREE.BoxGeometry(0.075, 0.08, 0.12), mats.rubber, 34, 0.535, 0.055));
  mesh(w, new THREE.TorusGeometry(0.36, 0.028, 6, 30), mats.gold);
  const sp = new THREE.BoxGeometry(0.025, 0.72, 0.03);
  for (let i = 0; i < 4; i++) mesh(w, sp, mats.alu, 0, 0, 0, 0, 0, (i * PI) / 4);
  mesh(w, new THREE.CylinderGeometry(0.075, 0.075, 0.24, 12), mats.paint, 0, 0, 0, PI / 2);
  if (front) mesh(w, new THREE.CylinderGeometry(0.16, 0.16, 0.015, 16), mats.steel, 0, 0, 0.1, PI / 2);
  return w;
}
function buildDirt(color, number) {
  const body = new THREE.Group();
  const mats = {
    paint: std(color, 0.35, 0.15), white: std('#f4f4f6', 0.4, 0.05), black: std('#18181c', 0.8),
    alu: std('#c3c7cf', 0.3, 0.85), gold: std('#d9a521', 0.3, 0.9), rubber: std('#141414', 0.95),
    steel: std('#9aa0aa', 0.35, 0.9), spring: std('#ffcf40', 0.4, 0.4), pipe: std('#8fa3c0', 0.25, 0.95),
  };
  const rear = dirtWheel(mats, false); rear.position.set(RX, WHEEL_R, 0);
  const front = dirtWheel(mats, true); front.position.set(FX, WHEEL_R, 0);
  body.add(rear, front);

  // forks: thin chrome stanchions below, fat gold tubes up top
  const low = unitCyl(0.035), up = unitCyl(0.055);
  for (const z of [0.13, -0.13]) {
    strut(body, low, mats.alu, [FX, WHEEL_R], [0.82, 0.98], z);
    strut(body, up, mats.gold, [0.82, 0.98], [0.66, 1.5], z);
  }
  mesh(body, new THREE.BoxGeometry(0.12, 0.07, 0.36), mats.black, 0.67, 1.48, 0, 0, 0, -0.3);
  mesh(body, new THREE.CylinderGeometry(0.025, 0.025, 0.82, 8), mats.black, 0.6, 1.63, 0, PI / 2);
  mesh(body, new THREE.BoxGeometry(0.04, 0.3, 0.3), mats.paint, 0.78, 1.36, 0, 0, 0, -0.3); // front plate

  // plastics
  mesh(body, extrude([[0.72, 1.14], [1.35, 1.22], [1.47, 1.16], [1.25, 1.11], [0.95, 1.13], [0.7, 1.09]], 0.2, 0.02), mats.paint);
  mesh(body, extrude([[0.64, 1.45], [0.1, 1.4], [-0.12, 1.3], [-0.05, 1.12], [0.25, 0.98], [0.55, 0.96], [0.74, 1.2]], 0.42, 0.025), mats.paint);
  mesh(body, extrude([[0.08, 1.4], [-1.0, 1.37], [-1.06, 1.3], [0.0, 1.29]], 0.3, 0.02), mats.black);
  mesh(body, extrude([[-0.1, 1.3], [-1.0, 1.32], [-0.82, 1.0], [-0.2, 0.97]], 0.34, 0.02), mats.white);
  mesh(body, extrude([[-0.3, 1.31], [-1.48, 1.53], [-1.52, 1.47], [-0.95, 1.3], [-0.3, 1.25]], 0.26, 0.02), mats.paint);
  const plate = decalMat(numberTex(number, { shape: 'clear', fg: '#111', ring: color }));
  pair(body, new THREE.PlaneGeometry(0.36, 0.36), plate, -0.55, 1.15, 0.195).forEach((m, i) => { if (i) m.rotation.y = PI; m.castShadow = false; });

  // engine + chassis
  mesh(body, new THREE.BoxGeometry(0.48, 0.38, 0.3), mats.black, 0.05, 0.74, 0);
  mesh(body, new THREE.BoxGeometry(0.26, 0.26, 0.26), mats.alu, 0.2, 1.0, 0, 0, 0, -0.3);
  mesh(body, new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), mats.steel, 0.0, 0.72, 0.17, PI / 2);
  const arm = unitCyl(0.045);
  strut(body, arm, mats.alu, [-0.1, 0.74], [RX, WHEEL_R], 0.13);
  strut(body, arm, mats.alu, [-0.1, 0.74], [RX, WHEEL_R], -0.13);
  strut(body, unitCyl(0.06), mats.spring, [-0.35, 0.72], [-0.15, 1.15]);
  mesh(body, tube([[0.3, 1.02, 0.12], [0.42, 0.78, 0.18], [0.25, 0.5, 0.2], [-0.1, 0.6, 0.21], [-0.45, 0.95, 0.21]], 0.045), mats.pipe);
  strut(body, unitCyl(0.08, 12), mats.alu, [-0.42, 0.93], [-1.12, 1.24], 0.21);
  pair(body, new THREE.BoxGeometry(0.14, 0.04, 0.12), mats.alu, -0.05, 0.62, 0.22);

  const flame = makeFlame(body, -1.13, 1.245, 0.21, 0.42);
  const rider = buildRider({
    suit: std(color, 0.7), pants: std('#2a2a35', 0.8), boots: std('#e8e8ea', 0.5), accent: mats.paint, head: 'mx',
    pose: { hip: [-0.32, 1.45], shoulder: [0.08, 1.98], head: [0.28, 2.26], elbow: [0.36, 1.7], hand: [0.58, 1.64], knee: [0.3, 1.28], foot: [-0.05, 0.66] },
  });
  return { body, rear, front, flame, rider: rider.group, extras: [...rider.extras] };
}

// ---------- 2. Iron Buffalo (chopper) ----------
function buildChopper(color, number) {
  const body = new THREE.Group();
  const chrome = chromeMat();
  const paint = std(color, 0.18, 0.55);
  const black = std('#141418', 0.45, 0.4);
  const rubber = std('#121212', 0.95);
  const leather = std('#5a3520', 0.8);

  // skinny tall front wheel
  const front = new THREE.Group();
  mesh(front, new THREE.TorusGeometry(0.49, 0.06, 8, 32), rubber);
  mesh(front, new THREE.TorusGeometry(0.42, 0.022, 6, 32), chrome);
  const sp = new THREE.BoxGeometry(0.02, 0.84, 0.02);
  for (let i = 0; i < 6; i++) mesh(front, sp, chrome, 0, 0, 0, 0, 0, (i * PI) / 6);
  mesh(front, new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12), chrome, 0, 0, 0, PI / 2);
  front.position.set(FX, WHEEL_R, 0);
  // fat rear boot on a solid chrome mag wheel
  const rear = new THREE.Group();
  mesh(rear, new THREE.TorusGeometry(0.4, 0.15, 10, 32), rubber).scale.z = 1.45;
  mesh(rear, new THREE.CylinderGeometry(0.29, 0.29, 0.34, 24), chrome, 0, 0, 0, PI / 2);
  const slot = new THREE.BoxGeometry(0.07, 0.4, 0.36);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    mesh(rear, slot, black, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0, 0, 0, a);
  }
  rear.position.set(RX, WHEEL_R, 0);
  body.add(front, rear);

  // frame (black), long raked springer fork (chrome)
  const rod = unitCyl(0.035);
  strut(body, rod, black, [0.36, 1.42], [0.12, 0.42]);
  strut(body, rod, black, [0.3, 1.52], [-0.55, 1.02]);
  for (const z of [0.13, -0.13]) {
    strut(body, rod, black, [0.12, 0.42], [RX, WHEEL_R], z);
    strut(body, rod, black, [RX, WHEEL_R], [-0.6, 1.02], z);
    strut(body, unitCyl(0.032), chrome, [FX, WHEEL_R], [0.3, 1.64], z);
  }
  mesh(body, new THREE.BoxGeometry(0.1, 0.06, 0.34), chrome, 0.31, 1.62, 0, 0, 0, 0.55);
  // ape hangers
  mesh(body, tube([[0.08, 2.18, 0.42], [0.22, 2.22, 0.38], [0.3, 2.0, 0.24], [0.31, 1.7, 0.1], [0.31, 1.7, -0.1], [0.3, 2.0, -0.24], [0.22, 2.22, -0.38], [0.08, 2.18, -0.42]], 0.028, 48), chrome);
  // headlight
  mesh(body, new THREE.SphereGeometry(0.12, 14, 10), chrome, 0.45, 1.52, 0);
  mesh(body, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), glow('#fff4d0', 1.2), 0.565, 1.52, 0, 0, 0, PI / 2);
  // teardrop tank with number
  mesh(body, new THREE.SphereGeometry(1, 20, 14), paint, -0.05, 1.38, 0, 0, 0, -0.14).scale.set(0.48, 0.19, 0.2);
  const dec = decalMat(numberTex(number, { shape: 'clear', fg: '#f5d76e', ring: '#1a1a1a', font: 'italic bold 80px Georgia, serif' }));
  pair(body, new THREE.PlaneGeometry(0.2, 0.2), dec, -0.08, 1.37, 0.19).forEach((m, i) => { if (i) m.rotation.y = PI; m.castShadow = false; });
  // V-twin: finned lathe cylinders
  const fins = [];
  for (let i = 0; i <= 8; i++) fins.push([i % 2 ? 0.15 : 0.12, (i / 8) * 0.42]);
  fins.unshift([0, 0]); fins.push([0.09, 0.44], [0, 0.46]);
  const cyl = new THREE.LatheGeometry(fins.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  mesh(body, cyl, chrome, 0.02 + Math.sin(0.45) * 0.08, 0.62, 0, 0, 0, -0.45);
  mesh(body, cyl, chrome, 0.02 - Math.sin(0.45) * 0.08, 0.62, 0, 0, 0, 0.45);
  mesh(body, new THREE.CylinderGeometry(0.2, 0.2, 0.3, 20), chrome, 0.02, 0.58, 0, PI / 2);
  mesh(body, new THREE.CylinderGeometry(0.13, 0.13, 0.06, 20), paint, 0.05, 0.96, 0.2, PI / 2);
  // shotgun pipes
  mesh(body, tube([[0.22, 0.98, 0.14], [0.32, 0.72, 0.22], [0.05, 0.45, 0.26], [-0.6, 0.42, 0.27], [-1.38, 0.5, 0.27]], 0.04), chrome);
  mesh(body, tube([[-0.18, 0.96, 0.14], [-0.28, 0.72, 0.22], [-0.5, 0.6, 0.3], [-1.42, 0.68, 0.3]], 0.04), chrome);
  // saddle, sissy bar, fender
  mesh(body, extrude([[-0.1, 1.14], [-0.35, 1.02], [-0.62, 1.03], [-0.76, 1.22], [-0.68, 1.27], [-0.5, 1.13]], 0.32, 0.03), leather);
  mesh(body, tube([[-0.7, 1.0, 0.16], [-0.86, 1.6, 0.16], [-0.95, 1.92, 0], [-0.86, 1.6, -0.16], [-0.7, 1.0, -0.16]], 0.022), chrome);
  const fender = mesh(body, new THREE.TorusGeometry(0.64, 0.055, 6, 24, 1.95), paint, RX, WHEEL_R, 0, 0, 0, 0.75);
  fender.scale.z = 3.4;
  pair(body, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), chrome, 0.55, 0.6, 0.22, PI / 2);

  const flame = makeFlame(body, -1.44, 0.69, 0.3, 0.1, { len: 0.8, r: 0.12 });
  const rider = buildRider({
    suit: std(color, 0.75), torso: std('#16161a', 0.55, 0.2), pants: std('#34507a', 0.9), boots: std('#18120e', 0.6),
    accent: std(color, 0.7), head: 'bandana',
    pose: { hip: [-0.46, 1.2], shoulder: [-0.4, 1.86], head: [-0.34, 2.16], elbow: [-0.15, 1.8], hand: [0.08, 2.17], knee: [0.12, 1.27], foot: [0.52, 0.66] },
  });
  return { body, rear, front, flame, rider: rider.group, extras: [...rider.extras] };
}

// ---------- 3. Viper GT (sport) ----------
function sportWheel(rubber, spokeMat, rimMat, disc) {
  const w = new THREE.Group();
  mesh(w, new THREE.TorusGeometry(0.46, 0.09, 10, 32), rubber);
  mesh(w, new THREE.TorusGeometry(0.385, 0.03, 6, 32), rimMat);
  const sp = new THREE.BoxGeometry(0.31, 0.06, 0.05); sp.translate(0.23, 0, 0);
  for (let i = 0; i < 5; i++) mesh(w, sp, spokeMat, 0, 0, 0, 0, 0, (i / 5) * PI * 2);
  mesh(w, new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), rimMat, 0, 0, 0, PI / 2);
  if (disc) mesh(w, new THREE.TorusGeometry(0.25, 0.04, 4, 28), std('#b8bcc4', 0.3, 0.9), 0, 0, 0.09).scale.z = 0.3;
  return w;
}
function buildSport(color, number) {
  const body = new THREE.Group();
  const paint = std(color, 0.2, 0.45);
  const white = std('#f6f6f8', 0.3, 0.1);
  const carbon = std('#1b1c20', 0.35, 0.5);
  const gold = std('#e0b020', 0.25, 0.9);
  const rubber = std('#111', 0.9);
  const rear = sportWheel(rubber, gold, carbon, false); rear.position.set(RX, WHEEL_R, 0);
  const front = sportWheel(rubber, gold, carbon, true); front.position.set(FX, WHEEL_R, 0);
  body.add(rear, front);

  for (const z of [0.12, -0.12]) {
    strut(body, unitCyl(0.034), std('#d8dce2', 0.2, 1), [FX, WHEEL_R], [0.86, 0.95], z);
    strut(body, unitCyl(0.05), gold, [0.86, 0.95], [0.72, 1.45], z);
    strut(body, unitCyl(0.045), carbon, [-0.1, 0.72], [RX, WHEEL_R], z);
  }
  mesh(body, new THREE.TorusGeometry(0.56, 0.05, 5, 16, 1.5), paint, FX, WHEEL_R, 0, 0, 0, 0.55).scale.z = 2.2; // hugger
  // main fairing silhouette
  mesh(body, extrude([
    [1.22, 1.3], [1.06, 1.1], [0.74, 1.0], [0.52, 0.5], [0.4, 0.4], [-0.2, 0.38], [-0.32, 0.62], [-0.22, 0.95],
    [-0.6, 1.06], [-1.06, 1.16], [-1.48, 1.42], [-1.32, 1.5], [-0.72, 1.4], [-0.45, 1.3], [0.05, 1.32], [0.36, 1.52], [0.72, 1.56], [1.02, 1.5],
  ], 0.44, 0.04, true), paint);
  // livery stripes (slightly wider so they sit on the surface)
  mesh(body, extrude([[1.14, 1.27], [0.3, 1.25], [-0.5, 1.2], [-1.36, 1.38], [-1.3, 1.32], [-0.5, 1.12], [0.3, 1.17], [1.1, 1.19]], 0.54, 0.01, true), white);
  mesh(body, extrude([[1.02, 1.13], [0.4, 1.08], [-0.25, 0.8], [-0.25, 0.73], [0.4, 1.0], [0.95, 1.07]], 0.54, 0.01), carbon);
  mesh(body, extrude([[0.98, 1.52], [0.64, 1.82], [0.56, 1.76], [0.74, 1.56]], 0.34, 0.015), std('#2a3440', 0.05, 0.3, { transparent: true, opacity: 0.55 }));
  mesh(body, extrude([[0.05, 1.33], [-0.72, 1.42], [-0.74, 1.36], [0.0, 1.28]], 0.3, 0.02), carbon);
  mesh(body, new THREE.BoxGeometry(0.06, 0.08, 0.26), glow('#fffbe6', 1.4), 1.2, 1.32, 0, 0, 0, 0.6); // headlight
  mesh(body, new THREE.BoxGeometry(0.04, 0.05, 0.2), glow('#ff2030', 1.4), -1.49, 1.44, 0);           // taillight
  const dec = decalMat(numberTex(number, { shape: 'round', bg: '#fff', fg: '#111', ring: '#111', font: 'bold 78px system-ui' }));
  pair(body, new THREE.PlaneGeometry(0.34, 0.34), dec, 0.1, 0.78, 0.265).forEach((m, i) => { if (i) m.rotation.y = PI; m.castShadow = false; });
  // under-tail twin exhaust
  mesh(body, new THREE.CylinderGeometry(0.075, 0.09, 0.5, 14), std('#c9cdd4', 0.2, 1), -0.95, 1.12, 0.12, 0, 0, PI / 2 + 0.35);
  pair(body, new THREE.BoxGeometry(0.16, 0.04, 0.08), carbon, -0.35, 0.95, 0.24);

  const flame = makeFlame(body, -1.19, 1.21, 0.12, 0.35, { outer: '#3aa0ff', inner: '#e6f4ff', len: 0.8 });
  const rider = buildRider({
    suit: std(color, 0.55, 0.1), pants: std(color, 0.55, 0.1), boots: std('#1a1a1f', 0.5), accent: std(color, 0.2, 0.4),
    trim: white, visor: std('#101418', 0.05, 0.9), head: 'full', headTilt: -0.35,
    pose: { hip: [-0.52, 1.5], shoulder: [0.22, 1.86], head: [0.44, 2.0], elbow: [0.36, 1.52], hand: [0.74, 1.54], knee: [0.18, 1.2], foot: [-0.36, 0.98] },
  });
  return { body, rear, front, flame, rider: rider.group, extras: [...rider.extras] };
}

// ---------- 4. Photon Ghost (hover) ----------
function hoverRing(ringMat, segMat, fieldMat, extras) {
  const w = new THREE.Group();
  extras.push(mesh(w, new THREE.TorusGeometry(0.4, 0.045, 8, 40), ringMat));
  const seg = new THREE.TorusGeometry(0.4, 0.075, 8, 10, 0.7);
  for (let i = 0; i < 3; i++) extras.push(mesh(w, seg, segMat, 0, 0, 0, 0, 0, (i / 3) * PI * 2));
  const field = mesh(w, new THREE.CircleGeometry(0.38, 32), fieldMat);
  field.castShadow = false;
  extras.push(mesh(w, new THREE.SphereGeometry(0.08, 12, 8), segMat));
  const bar = new THREE.BoxGeometry(0.03, 0.72, 0.03);
  mesh(w, bar, segMat, 0, 0, 0, 0, 0, 0.4);
  return w;
}
function buildHover(color) {
  const body = new THREE.Group();
  const extras = [];
  const neon = new THREE.Color(color);
  const ringMat = glow(neon, 1.0);
  const segMat = glow('#ffffff', 0.9);
  const fieldMat = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const gun = std('#1d2129', 0.25, 0.8);
  const pearl = std('#eef1f6', 0.2, 0.35);

  const rear = hoverRing(ringMat, segMat, fieldMat, extras); rear.position.set(RX, WHEEL_R, 0);
  const front = hoverRing(ringMat, segMat, fieldMat, extras); front.position.set(FX, WHEEL_R, 0);
  body.add(rear, front);

  // pod hull + colour cowl on top
  const prof = [[-1.35, 0], [-1.35, 0.13], [-1.1, 0.22], [-0.6, 0.3], [0, 0.33], [0.6, 0.28], [1.1, 0.17], [1.42, 0.05], [1.46, 0]];
  const hull = mesh(body, latheX(prof, 28), gun, 0, 1.2, 0); hull.scale.z = 0.9;
  const cowl = mesh(body, latheX(prof.map(([x, r]) => [x, r * 1.04]), 28, PI * 1.5 - 1.5, 3.0), std(color, 0.2, 0.5, { side: THREE.DoubleSide }), 0, 1.2, 0);
  cowl.scale.z = 0.9;
  mesh(body, latheX([[1.1, 0.19], [1.2, 0.16], [1.42, 0.06], [1.48, 0]], 20), pearl, 0, 1.2, 0).scale.z = 0.9;
  // neon hoops around the hull
  const hoop = new THREE.TorusGeometry(0.315, 0.022, 6, 32);
  extras.push(mesh(body, hoop, ringMat, -0.75, 1.2, 0, 0, PI / 2, 0));
  const h2 = mesh(body, hoop, ringMat, 0.62, 1.2, 0, 0, PI / 2, 0); h2.scale.set(0.9, 0.9, 1); extras.push(h2);
  // swing arms to the rings
  const arm = new THREE.BoxGeometry(0.07, 1, 0.05);
  for (const z of [0.09, -0.09]) {
    strut(body, arm, gun, [-0.4, 1.05], [RX, WHEEL_R], z);
    strut(body, arm, gun, [0.45, 1.05], [FX, WHEEL_R], z);
  }
  // rear thruster
  mesh(body, new THREE.CylinderGeometry(0.15, 0.19, 0.3, 18), gun, -1.38, 1.2, 0, 0, 0, PI / 2);
  extras.push(mesh(body, new THREE.CircleGeometry(0.15, 20), ringMat, -1.535, 1.2, 0, 0, -PI / 2, 0));
  // yoke
  mesh(body, new THREE.BoxGeometry(0.08, 0.06, 0.62), pearl, 0.6, 1.62, 0);
  strut(body, unitCyl(0.03), pearl, [0.75, 1.4], [0.6, 1.62]);
  // translucent canopy (no shadow: it's glass)
  const canopy = mesh(body, new THREE.SphereGeometry(0.5, 24, 14, 0, PI * 2, 0, PI / 2),
    new THREE.MeshStandardMaterial({ color: neon, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    0.12, 1.4, 0);
  canopy.scale.set(1.3, 1.95, 0.72);
  canopy.castShadow = false;
  // underglow
  const under = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.5), new THREE.MeshBasicMaterial({ color: neon, map: glowTex(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  under.rotation.x = -PI / 2; under.position.y = 0.03;
  body.add(under);
  extras.push(under);

  const flame = makeFlame(body, -1.54, 1.2, 0, 0, { outer: neon.getStyle(), inner: '#ffffff', len: 0.9, r: 0.14 });
  const rider = buildRider({
    suit: std('#e9edf3', 0.4, 0.2), pants: std('#2a2f3a', 0.5, 0.3), arm: std(color, 0.4, 0.3), boots: gun,
    accent: std('#f2f4f8', 0.15, 0.5), trim: ringMat, visor: glow(neon, 1.8), head: 'full', headTilt: -0.2,
    pose: { hip: [-0.3, 1.46], shoulder: [0.08, 1.95], head: [0.3, 2.14], elbow: [0.32, 1.66], hand: [0.6, 1.66], knee: [0.34, 1.4], foot: [0.1, 1.02] },
  });
  extras.push(...rider.extras);
  return { body, rear, front, flame, rider: rider.group, extras };
}

// ---------- 5. Titan Walker-X (mech) ----------
function mechWheel(m) {
  const w = new THREE.Group();
  mesh(w, new THREE.TorusGeometry(0.4, 0.13, 8, 24), m.rubber);
  w.add(ringInstances(new THREE.BoxGeometry(0.1, 0.17, 0.44), m.tread, 16, 0.5));
  mesh(w, new THREE.CylinderGeometry(0.3, 0.3, 0.34, 8), m.dark, 0, 0, 0, PI / 2);
  const bar = new THREE.BoxGeometry(0.1, 0.56, 0.38);
  for (let i = 0; i < 2; i++) mesh(w, bar, m.hazard, 0, 0, 0, 0, 0, (i * PI) / 2);
  mesh(w, new THREE.CylinderGeometry(0.1, 0.1, 0.42, 6), m.paint, 0, 0, 0, PI / 2);
  return w;
}
function buildMech(color, number) {
  const body = new THREE.Group();
  const extras = [];
  const m = {
    paint: std(color, 0.45, 0.35), dark: std('#2b2e35', 0.55, 0.6), tread: std('#3c4048', 0.6, 0.7),
    rubber: std('#131313', 0.95), hazard: std('#ffc21a', 0.5, 0.2), chrome: chromeMat(), steel: std('#6c727d', 0.4, 0.8),
  };
  const eye = glow('#ff3030', 2.2);
  const rear = mechWheel(m); rear.position.set(RX, WHEEL_R, 0);
  const front = mechWheel(m); front.position.set(FX, WHEEL_R, 0);
  body.add(rear, front);

  // armoured hull, belly plate, front armour fender, face plate
  mesh(body, extrude([[0.78, 1.62], [0.2, 1.68], [-0.3, 1.52], [-1.25, 1.56], [-1.38, 1.3], [-0.9, 1.04], [-0.3, 0.86], [0.3, 0.82], [0.64, 1.08]], 0.52, 0.04), m.paint);
  mesh(body, extrude([[0.5, 0.95], [-0.38, 0.8], [-0.24, 0.42], [0.3, 0.4], [0.56, 0.62]], 0.6, 0.03), m.dark);
  mesh(body, extrude([[0.55, 1.28], [1.28, 1.32], [1.52, 1.1], [1.42, 1.04], [1.16, 1.19], [0.6, 1.14]], 0.52, 0.03), m.paint);
  mesh(body, new THREE.BoxGeometry(0.2, 0.34, 0.54), m.dark, 0.8, 1.54, 0, 0, 0, -0.3);
  const lamp = new THREE.BoxGeometry(0.04, 0.07, 0.16);
  pair(body, lamp, glow('#fff6c8', 2), 0.91, 1.57, 0.14, 0, 0, -0.3).forEach((x) => extras.push(x));
  // decals: hazard stripe + stencil number
  const hz = decalMat(hazardTex(), { alphaTest: 0 });
  pair(body, new THREE.PlaneGeometry(0.6, 0.15), hz, -0.8, 1.44, 0.311).forEach((x, i) => { if (i) x.rotation.y = PI; x.castShadow = false; });
  const num = decalMat(numberTex(number, { shape: 'clear', fg: '#15151a', font: 'bold 96px Impact, monospace' }));
  pair(body, new THREE.PlaneGeometry(0.4, 0.4), num, 0.3, 1.25, 0.311).forEach((x, i) => { if (i) x.rotation.y = PI; x.castShadow = false; });
  // reactor ring on the flank
  const reactor = mesh(body, new THREE.TorusGeometry(0.13, 0.035, 8, 24), glow(color, 1.8), -0.35, 1.18, 0.3);
  extras.push(reactor);
  // exposed pistons, front and rear
  const outer = unitCyl(0.07, 12), rod = unitCyl(0.038, 10), rearOuter = unitCyl(0.08, 12);
  for (const z of [0.3, -0.3]) {
    strut(body, outer, m.dark, [0.66, 1.55], [0.82, 1.02], z);
    strut(body, rod, m.chrome, [0.82, 1.06], [FX, WHEEL_R], z);
    strut(body, new THREE.BoxGeometry(0.13, 1, 0.1), m.steel, [-0.2, 0.74], [RX, WHEEL_R], z);
    strut(body, rearOuter, m.hazard, [-0.6, 0.62], [-0.45, 0.98], z);
  }
  // stacks + thruster + bars
  const stack = unitCyl(0.06, 12);
  strut(body, stack, m.chrome, [-0.95, 1.5], [-1.08, 2.08], 0.16);
  strut(body, stack, m.chrome, [-0.95, 1.5], [-1.08, 2.08], -0.16);
  mesh(body, new THREE.BoxGeometry(0.08, 0.06, 0.9), m.dark, 0.55, 1.82, 0);

  const flame = makeFlame(body, -1.38, 1.28, 0, 0.05, { len: 0.95, r: 0.16, outer: '#ff4a1a', inner: '#ffd070' });
  const rider = buildRider({
    robot: true, metal: std('#c3c9d3', 0.35, 0.5), accent: m.paint, eye, pants: std('#5b616c', 0.4, 0.8), arm: std('#5b616c', 0.4, 0.8),
    boots: m.dark, head: 'robot',
    pose: { hip: [-0.42, 1.72], shoulder: [-0.12, 2.28], head: [0.06, 2.6], elbow: [0.2, 1.98], hand: [0.55, 1.84], knee: [0.26, 1.58], foot: [-0.05, 1.05] },
  });
  extras.push(...rider.extras);
  return { body, rear, front, flame, rider: rider.group, extras };
}

// ---------- 6. Tin Rocket 1950 (retro) ----------
function retroWheel(m) {
  const w = new THREE.Group();
  mesh(w, new THREE.TorusGeometry(0.45, 0.1, 10, 32), m.rubber);
  const ww = new THREE.TorusGeometry(0.39, 0.045, 6, 32);
  mesh(w, ww, m.white, 0, 0, 0.06); mesh(w, ww, m.white, 0, 0, -0.06);
  mesh(w, new THREE.CylinderGeometry(0.29, 0.29, 0.22, 24), m.chrome, 0, 0, 0, PI / 2);
  mesh(w, new THREE.BoxGeometry(0.5, 0.07, 0.24), m.fin, 0, 0, 0);
  mesh(w, new THREE.SphereGeometry(0.07, 12, 8), m.fin, 0, 0, 0).scale.z = 2;
  return w;
}
function buildRetro(color, number) {
  const body = new THREE.Group();
  const extras = [];
  const base = new THREE.Color(color);
  const pastel = base.clone().lerp(new THREE.Color('#ffffff'), 0.5);
  const m = {
    body: std(pastel, 0.3, 0.25), fin: std(base, 0.3, 0.3), chrome: chromeMat(),
    rubber: std('#151515', 0.9), white: std('#f5f2e8', 0.6),
  };
  const Y = 1.15;
  const rear = retroWheel(m); rear.position.set(RX, WHEEL_R, 0);
  const front = retroWheel(m); front.position.set(FX, WHEEL_R, 0);
  body.add(rear, front);

  // fuselage, chrome nose, chrome bands
  mesh(body, latheX([[-1.36, 0], [-1.36, 0.2], [-1.2, 0.29], [-0.8, 0.37], [-0.2, 0.4], [0.4, 0.37], [0.8, 0.3], [1.06, 0.2], [1.06, 0]], 28), m.body, 0, Y, 0);
  mesh(body, latheX([[1.04, 0], [1.04, 0.205], [1.25, 0.15], [1.4, 0.07], [1.47, 0]], 24), m.chrome, 0, Y, 0);
  mesh(body, new THREE.TorusGeometry(0.375, 0.025, 6, 32), m.chrome, -0.8, Y, 0, 0, PI / 2, 0);
  mesh(body, new THREE.TorusGeometry(0.305, 0.025, 6, 32), m.chrome, 0.8, Y, 0, 0, PI / 2, 0);
  // tail fins (3 at 120 degrees)
  const finGeo = extrude([[-0.72, 0], [-1.3, 0], [-1.62, 0.78], [-1.4, 0.8]], 0.04, 0.015);
  for (const a of [0, 2.1, -2.1]) mesh(body, finGeo, m.fin, 0, Y, 0, a, 0, 0);
  // rocket nozzle + inner glow
  mesh(body, latheX([[-1.62, 0.28], [-1.58, 0.26], [-1.45, 0.19], [-1.34, 0.16]], 22), std('#dfe3ea', 0.14, 1, { side: THREE.DoubleSide }), 0, Y, 0);
  extras.push(mesh(body, new THREE.CircleGeometry(0.17, 20), glow('#ff7a1a', 2), -1.42, Y, 0, 0, -PI / 2, 0));
  // portholes + roundel number
  pair(body, new THREE.TorusGeometry(0.08, 0.022, 6, 20), m.chrome, 0.55, Y + 0.02, 0.36);
  const roundel = decalMat(numberTex(number, { shape: 'round', bg: '#f5f2e8', fg: base.getStyle(), ring: base.getStyle(), font: 'bold 80px Georgia, serif' }));
  pair(body, new THREE.PlaneGeometry(0.34, 0.34), roundel, -0.45, Y - 0.05, 0.405).forEach((x, i) => { if (i) x.rotation.y = PI; x.castShadow = false; });
  // bubble canopy + chrome rim
  const bubble = mesh(body, new THREE.SphereGeometry(0.55, 24, 16, 0, PI * 2, 0, PI * 0.62),
    new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.25, roughness: 0.02, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }), -0.12, Y + 0.3, 0);
  bubble.scale.set(1.05, 1.5, 0.9);
  bubble.castShadow = false;
  const rim = mesh(body, new THREE.TorusGeometry(0.5, 0.035, 6, 32), m.chrome, -0.12, Y + 0.33, 0, PI / 2, 0, 0);
  rim.scale.set(1.05, 0.9, 1);
  // antenna + yoke
  strut(body, unitCyl(0.012, 6), m.chrome, [0.78, Y + 0.28], [0.95, Y + 0.72]);
  extras.push(mesh(body, new THREE.SphereGeometry(0.045, 10, 8), glow('#ff3b3b', 2), 0.95, Y + 0.73, 0));
  strut(body, unitCyl(0.025, 8), m.chrome, [0.38, Y + 0.3], [0.3, Y + 0.56]);
  mesh(body, new THREE.BoxGeometry(0.05, 0.05, 0.46), m.chrome, 0.3, Y + 0.56, 0);

  const flame = makeFlame(body, -1.6, Y, 0, 0, { len: 1.4, r: 0.24, outer: '#ff5a1a', inner: '#fff1b0' });
  const rider = buildRider({
    suit: std('#7a4a2c', 0.75), pants: std('#b8a07a', 0.85), boots: std('#3a2416', 0.6), accent: m.fin, head: 'aviator',
    pose: { hip: [-0.3, 1.52], shoulder: [-0.2, 2.02], head: [-0.1, 2.3], elbow: [0.08, 1.78], hand: [0.3, 1.72], knee: [0.2, 1.58], foot: [0.15, 1.2] },
  });
  return { body, rear, front, flame, rider: rider.group, extras };
}

const BUILDERS = { dirt: buildDirt, chopper: buildChopper, sport: buildSport, hover: buildHover, mech: buildMech, retro: buildRetro };

export function buildBike(modelId = 'dirt', color = '#ff3b3b', number = '1') {
  const make = BUILDERS[modelId] || buildDirt;
  const b = make(color, String(number));
  const root = new THREE.Group(); // positioned at ground contact, rotated by pitch
  root.add(b.body);
  const links = [];
  b.body.traverse((o) => { if (o.userData.link) links.push({ mesh: o, ...o.userData.link }); });
  b.body.add(b.rider);
  return { root, body: b.body, rider: b.rider, rear: b.rear, front: b.front, flame: b.flame, extras: b.extras || [], links, model: modelId };
}
