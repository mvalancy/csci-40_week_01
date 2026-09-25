// Visual QA page: every bike model on its own turntable, one viewport per model.
// ?view=side freezes all turntables side-on (as the game camera sees them).
import * as THREE from 'three';
import { buildBike, BIKE_MODELS, WHEEL_R } from './bikes.js';

window.__app = { ready: false, frames: 0 };
const params = new URLSearchParams(location.search);
let mode = params.get('view') === 'side' ? 'side' : 'spin';
let turbo = params.get('turbo') !== '0';

const COLORS = ['#ff3b3b', '#3b7bff', '#2ecc71', '#b45cff', '#ff9f1a', '#ff5fa2'];
const BG = ['#1a1d26', '#1d1a22', '#171d1f', '#0d0f1c', '#1f1b16', '#1c1a24'];

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // match the game
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);

const labels = document.getElementById('labels');
const only = params.get('only');
const cells = BIKE_MODELS.filter((m) => !only || m.id === only).map((model, i) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG[i]);
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3228', 1.1));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(3, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#8fb4ff', 0.8);
  rim.position.set(-4, 3, -4);
  scene.add(rim);

  const table = new THREE.Group();
  scene.add(table);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, 0.12, 48), new THREE.MeshStandardMaterial({ color: '#2a2f3b', roughness: 0.8 }));
  disc.position.y = -0.06;
  disc.receiveShadow = true;
  table.add(disc);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.02, 6, 64), new THREE.MeshBasicMaterial({ color: COLORS[i] }));
  stripe.rotation.x = Math.PI / 2;
  table.add(stripe);

  const bike = buildBike(model.id, COLORS[i], String([1, 7, 3, 9, 5, 42][i]));
  table.add(bike.root);
  let meshes = 0;
  bike.root.traverse((o) => o.isMesh && meshes++);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `<h2>${model.name}<small>${model.id}</small></h2><p>${model.blurb}</p><div class="meta">${meshes} meshes</div>`;
  labels.appendChild(el);
  return { model, scene, table, bike, camera, meshes, phase: i * 0.7 };
});
window.__app.meshCounts = Object.fromEntries(cells.map((c) => [c.model.id, c.meshes]));

let cols = 3, rows = 2;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cols = cells.length === 1 ? 1 : w < 700 ? 2 : 3;
  rows = Math.ceil(cells.length / cols);
  labels.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  labels.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  const aspect = w / cols / (h / rows);
  for (const c of cells) {
    c.camera.aspect = aspect;
    // fit ~4.2 units of bike width in view
    const dist = Math.max(6.2, 4.4 / aspect / Math.tan((c.camera.fov * Math.PI) / 360) / 2 + 1);
    c.camera.position.set(0, 2.0, dist + 0.2);
    c.camera.lookAt(0, 1.3, 0);
    c.camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
resize();

const btn = (id) => document.getElementById(id);
const sync = () => {
  btn('spin').classList.toggle('on', mode === 'spin');
  btn('side').classList.toggle('on', mode === 'side');
  btn('turbo').classList.toggle('on', turbo);
};
btn('spin').onclick = () => { mode = 'spin'; sync(); };
btn('side').onclick = () => { mode = 'side'; sync(); };
btn('turbo').onclick = () => { turbo = !turbo; sync(); };
sync();

const timer = new THREE.Timer();
function frame(ts) {
  timer.update(ts);
  const dt = Math.min(0.05, timer.getDelta());
  const t = timer.getElapsed();
  const w = innerWidth, h = innerHeight, cw = w / cols, ch = h / rows;
  cells.forEach((c, i) => {
    const b = c.bike;
    const target = mode === 'side' ? 0 : t * 0.45 + c.phase;
    c.table.rotation.y = mode === 'side' ? c.table.rotation.y + (0 - c.table.rotation.y) * Math.min(1, dt * 6) : target;
    const spin = (14 * dt) / WHEEL_R;
    b.rear.rotation.z -= spin;
    b.front.rotation.z -= spin;
    b.rider.rotation.z = -0.05 + Math.sin(t * 1.3 + i) * 0.04;
    b.flame.visible = turbo;
    if (turbo) b.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    for (const e of b.extras) if (e.material.emissiveIntensity !== undefined) e.material.emissiveIntensity = 1.6 + Math.sin(t * 4 + i) * 0.5;
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * cw, y = h - (row + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(c.scene, c.camera);
  });
  window.__app.frames++;
  if (window.__app.frames > 2) window.__app.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
