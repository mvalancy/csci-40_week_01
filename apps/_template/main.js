import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07070d');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#88aaff', '#221133', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.position.set(3, 5, 2);
scene.add(sun);

const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1, 0.32, 200, 32),
  new THREE.MeshStandardMaterial({ color: '#ff2d95', metalness: 0.4, roughness: 0.25 })
);
const core = new THREE.Mesh(
  new THREE.SphereGeometry(0.55, 32, 16),
  new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#00e5ff', emissiveIntensity: 1.5 })
);
scene.add(knot, core);

// --- Test hook: tests read this with ai.state(). Keep it small & serialisable.
const app = (window.__app = { ready: false, frames: 0, clicks: 0, color: '#ff2d95' });

const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', (e) => {
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  if (raycaster.intersectObjects([knot, core]).length) {
    app.clicks += 1;
    app.color = '#' + new THREE.Color().setHSL(Math.random(), 0.8, 0.6).getHexString();
    knot.material.color.set(app.color);
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop((t) => {
  knot.rotation.set(t * 0.0004, t * 0.0007, 0);
  controls.update();
  renderer.render(scene, camera);
  app.frames += 1;
  app.ready = true;
});
