import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- rendering ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0820');
scene.fog = new THREE.Fog('#0b0820', 45, 110);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 9, 26);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 12;
controls.maxDistance = 45;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.5, 0.75);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight('#8a7dff', '#1a0f2e', 1.2));
const sun = new THREE.DirectionalLight('#ffe8d0', 2.4);
sun.position.set(12, 25, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 20, bottom: -8 });
scene.add(sun);

// Stars
{
  const n = 1500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(120 + Math.random() * 60);
    v.y = Math.abs(v.y) * 0.8 - 10;
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfd8ff', size: 0.6, fog: false })));
}

// ---------- physics ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.5;
world.defaultContactMaterial.restitution = 0.1;

// Floating island
const ISLAND_R = 9;
const island = new THREE.Group();
const top = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R, 1, 48), new THREE.MeshStandardMaterial({ color: '#2b2350', roughness: 0.8 }));
top.position.y = -0.5;
top.receiveShadow = true;
const rim = new THREE.Mesh(new THREE.TorusGeometry(ISLAND_R, 0.12, 8, 96), new THREE.MeshBasicMaterial({ color: '#00e5ff' }));
rim.rotation.x = Math.PI / 2;
const rock = new THREE.Mesh(new THREE.ConeGeometry(ISLAND_R, 12, 24, 3), new THREE.MeshStandardMaterial({ color: '#1b1435', roughness: 1, flatShading: true }));
rock.rotation.x = Math.PI;
rock.position.y = -7;
const grid = new THREE.PolarGridHelper(ISLAND_R - 0.3, 12, 6, 64, '#ff2d95', '#3a2d6e');
grid.position.y = 0.01;
island.add(top, rim, rock, grid);
scene.add(island);
const islandBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Cylinder(ISLAND_R, ISLAND_R, 1, 24) });
islandBody.position.set(0, -0.5, 0);
world.addBody(islandBody);

// ---------- audio ----------
let actx;
function boom(freq = 90, dur = 0.35, vol = 0.25) {
  try {
    actx ??= new AudioContext();
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    const src = actx.createBufferSource();
    const f = actx.createBiquadFilter();
    f.frequency.value = freq * 8;
    const g = actx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
  } catch {}
}

// ---------- level ----------
const PALETTE = ['#ff2d95', '#00e5ff', '#ffcf40', '#76ff03', '#b388ff'];
const PLANK = { w: 3, h: 0.6, d: 1 };
const plankGeo = new THREE.BoxGeometry(PLANK.w, PLANK.h, PLANK.d);
const plankShape = new CANNON.Box(new CANNON.Vec3(PLANK.w / 2, PLANK.h / 2, PLANK.d / 2));
let blocks = [];
let balls = [];
let level = 1;
let ammo = 0;
let shots = 0;
let state = 'aiming';
let stateTimer = 0;
let lastShot = 0;
const CLEAR_AT = 0.7;

function clearLevel() {
  for (const b of [...blocks, ...balls]) {
    world.removeBody(b.body);
    scene.remove(b.mesh);
  }
  blocks = [];
  balls = [];
}

function buildLevel(n) {
  clearLevel();
  const towers = Math.min(1 + n, 5);
  const layers = 6 + n * 2;
  for (let t = 0; t < towers; t++) {
    const a = towers === 1 ? 0 : (t / towers) * Math.PI * 2;
    const cx = towers === 1 ? 0 : Math.sin(a) * 4.5;
    const cz = towers === 1 ? 0 : Math.cos(a) * 4.5 - 1;
    const color = new THREE.Color(PALETTE[t % PALETTE.length]);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.4, metalness: 0.1 });
    for (let l = 0; l < layers; l++) {
      const rotated = l % 2 === 1;
      for (let k = -1; k <= 1; k++) {
        const body = new CANNON.Body({ mass: 1, shape: plankShape, sleepSpeedLimit: 0.2 });
        const off = k * PLANK.d * 1.0;
        body.position.set(cx + (rotated ? off : 0), PLANK.h / 2 + l * PLANK.h, cz + (rotated ? 0 : off));
        if (rotated) body.quaternion.setFromEuler(0, Math.PI / 2, 0);
        body.sleep(); // towers start perfectly still until something hits them
        world.addBody(body);
        const mesh = new THREE.Mesh(plankGeo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
        blocks.push({ body, mesh, start: body.position.clone(), knocked: false });
      }
    }
  }
  ammo = 5 + n;
  shots = 0;
  state = 'aiming';
  $('level').textContent = n;
  banner(null);
  renderAmmo();
}

// ---------- shooting ----------
const ballGeo = new THREE.SphereGeometry(0.45, 24, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: '#ffb13b', emissive: '#ff6a00', emissiveIntensity: 3 });
const raycaster = new THREE.Raycaster();

function fire(clientX, clientY) {
  if (state !== 'aiming' || ammo <= 0) return false;
  const p = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  const dir = raycaster.ray.direction;
  const body = new CANNON.Body({ mass: 6, shape: new CANNON.Sphere(0.45), linearDamping: 0.01 });
  const start = camera.position.clone().addScaledVector(dir, 2);
  body.position.set(start.x, start.y, start.z);
  body.velocity.set(dir.x * 48, dir.y * 48 + 3, dir.z * 48);
  body.addEventListener('collide', (e) => {
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact > 6 && performance.now() - lastThud > 60) {
      lastThud = performance.now();
      boom(60 + Math.random() * 40, 0.25, Math.min(0.3, impact / 60));
      sparks(body.position, 12);
    }
  });
  world.addBody(body);
  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.castShadow = true;
  scene.add(mesh);
  balls.push({ body, mesh, born: performance.now() });
  ammo -= 1;
  shots += 1;
  lastShot = performance.now();
  renderAmmo();
  boom(140, 0.3, 0.2);
  return true;
}
let lastThud = 0;

// Click fires; drag orbits.
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved < 8 && performance.now() - down.t < 500) fire(e.clientX, e.clientY);
  down = null;
});
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') buildLevel(level);
});

// ---------- sparks ----------
const sparkGeo = new THREE.SphereGeometry(0.08, 6, 4);
const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
const sparkPool = Array.from({ length: 200 }, () => {
  const m = new THREE.Mesh(sparkGeo, sparkMat);
  m.visible = false;
  scene.add(m);
  return { m, v: new THREE.Vector3(), life: 0 };
});
let sparkI = 0;
function sparks(pos, n) {
  for (let i = 0; i < n; i++) {
    const s = sparkPool[sparkI++ % sparkPool.length];
    s.m.position.set(pos.x, pos.y, pos.z);
    s.v.randomDirection().multiplyScalar(4 + Math.random() * 8);
    s.life = 0.4 + Math.random() * 0.4;
    s.m.visible = true;
  }
}

// ---------- HUD ----------
function $(id) { return document.getElementById(id); }
function renderAmmo() {
  const total = 5 + level;
  $('ammo').innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < total - ammo ? 'used' : ''}"></i>`).join('');
}
function banner(title, sub = '') {
  const el = $('banner');
  el.hidden = !title;
  if (title) el.innerHTML = `${title}<small>${sub}</small>`;
}
const progress = () => (blocks.length ? blocks.filter((b) => b.knocked).length / blocks.length : 0);

// ---------- loop ----------
const timer = new THREE.Timer();
const tmp = new THREE.Vector3();

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  world.step(1 / 60, dt, 4);

  for (const b of blocks) {
    b.mesh.position.copy(b.body.position);
    b.mesh.quaternion.copy(b.body.quaternion);
    if (!b.knocked) {
      tmp.copy(b.body.position);
      if (tmp.distanceTo(b.start) > 1.2 || tmp.y < b.start.y - 0.8) b.knocked = true;
    }
  }
  balls = balls.filter((b) => {
    b.mesh.position.copy(b.body.position);
    if (b.body.position.y < -40) {
      world.removeBody(b.body);
      scene.remove(b.mesh);
      return false;
    }
    return true;
  });
  for (const s of sparkPool) {
    if (!s.m.visible) continue;
    s.life -= dt;
    s.v.y -= 20 * dt;
    s.m.position.addScaledVector(s.v, dt);
    if (s.life <= 0) s.m.visible = false;
  }

  const p = progress();
  $('progress').style.width = `${Math.round(p * 100)}%`;
  $('pct').textContent = `${Math.round(p * 100)}%`;

  stateTimer += dt;
  // Wait for the rubble to settle before declaring the level lost.
  const settling = blocks.some((b) => b.body.velocity.lengthSquared() > 0.25);
  if ((state === 'aiming' || state === 'failed') && p >= CLEAR_AT) {
    state = 'cleared';
    stateTimer = 0;
    banner('LEVEL CLEAR!', `${Math.round(p * 100)}% smashed with ${shots} shots`);
    boom(50, 0.8, 0.3);
    sparks({ x: 0, y: 6, z: 0 }, 80);
  } else if (state === 'cleared' && stateTimer > 2.5) {
    level += 1;
    buildLevel(level);
  } else if (state === 'aiming' && ammo === 0 && performance.now() - lastShot > 2500 && (!settling || performance.now() - lastShot > 9000)) {
    state = 'failed';
    banner('OUT OF AMMO', 'press R or click to retry');
  }

  controls.update();
  composer.render();
  app.frames += 1;
  requestAnimationFrame(frame);
}

addEventListener('pointerup', () => { if (state === 'failed') buildLevel(level); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- test hook ----------
const app = (window.__app = {
  frames: 0,
  snapshot() {
    return {
      ready: this.frames > 5,
      frames: this.frames,
      state,
      level,
      ammo,
      shots,
      total: blocks.length,
      knocked: blocks.filter((b) => b.knocked).length,
      progress: progress(),
      balls: balls.length,
    };
  },
  debug: {
    // Screen positions of the lowest standing plank in each tower: the best places to aim.
    targets() {
      const standing = blocks.filter((b) => !b.knocked);
      const byTower = new Map();
      for (const b of standing) {
        const key = `${Math.round(b.start.x)}:${Math.round(b.start.z)}`;
        const cur = byTower.get(key);
        if (!cur || b.body.position.y < cur.body.position.y) byTower.set(key, b);
      }
      return [...byTower.values()].map((b) => {
        const v = b.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)).project(camera);
        return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
      }).filter((t) => t.x > 0 && t.x < innerWidth && t.y > 0 && t.y < innerHeight);
    },
  },
});

buildLevel(level);
requestAnimationFrame(frame);
