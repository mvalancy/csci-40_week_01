// A small turntable in the garage showing the selected bike in 3D.
import * as THREE from 'three';
import { buildBike } from './bikes.js';

export function createBikePreview() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(360, 200);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'bike-preview';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 360 / 200, 0.1, 50);
  camera.position.set(0, 1.6, 6.2);
  camera.lookAt(0, 1.0, 0);
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#302040', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#1c1c30', roughness: 0.4 }));
  disc.position.y = -0.04;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: '#ffcf40' }));
  rim.rotation.x = Math.PI / 2;
  const table = new THREE.Group();
  table.add(disc, rim);
  scene.add(table);
  let bike = null;
  let current = '';

  const loop = () => {
    requestAnimationFrame(loop);
    if (!renderer.domElement.isConnected || renderer.domElement.closest('[hidden]')) return;
    table.rotation.y += 0.01;
    if (bike) { bike.rear.rotation.z -= 0.12; bike.front.rotation.z -= 0.12; }
    renderer.render(scene, camera);
  };
  loop();

  return {
    canvas: renderer.domElement,
    setBike(id, color = '#ff3b3b') {
      if (id === current) return;
      current = id;
      if (bike) table.remove(bike.root);
      bike = buildBike(id, color, '1');
      bike.root.position.y = 0;
      table.add(bike.root);
    },
  };
}
