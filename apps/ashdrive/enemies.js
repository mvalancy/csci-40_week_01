import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ownedResources = new WeakMap();

// Only resources captured at model construction are owned by this module.
// Later attachments (shared weapons, markers, etc.) are never disposed here.
export function disposeEnemy(mesh) {
  const resources = ownedResources.get(mesh);
  if (!resources) return;
  ownedResources.delete(mesh);
  for (const texture of resources.textures) texture.dispose();
  for (const material of resources.materials) material.dispose();
  for (const geometry of resources.geometries) geometry.dispose();
}

// Grounded industrial silhouettes; forward is -Z for the arena's existing AI.
export function createEnemy(THREE, type = 'drone') {
  const root = new THREE.Group();
  root.name = `Defense ${type}`;
  const steel = new THREE.MeshStandardMaterial({ color: '#67716a', metalness: .8, roughness: .55 });
  const hull = new THREE.MeshStandardMaterial({ color: '#4a5140', metalness: .6, roughness: .75 });
  const panel = new THREE.MeshStandardMaterial({ color: '#74765a', metalness: .55, roughness: .65 });
  const dark = new THREE.MeshStandardMaterial({ color: '#202727', metalness: .65, roughness: .65 });
  const black = new THREE.MeshStandardMaterial({ color: '#0f1515', roughness: .85 });
  const warning = new THREE.MeshStandardMaterial({ color: '#b19446', metalness: .45, roughness: .6 });
  const signal = new THREE.MeshStandardMaterial({ color: '#ed683d', emissive: '#a82409', emissiveIntensity: 1.2 });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const rotors = [];
  function box(size, position, mat = hull, parent = root) {
    const mesh = new THREE.Mesh(boxGeometry, mat); mesh.position.set(...position); mesh.scale.set(...size); parent.add(mesh); return mesh;
  }
  function cylinder(radius, height, position, mat = steel, axis = 'y', parent = root, top = radius) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 16), mat);
    mesh.position.set(...position);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    parent.add(mesh); return mesh;
  }
  function gun(x, y, z, length = 1.5, parent = root) {
    box([.36, .4, .58], [x, y, z + .2], dark, parent);
    cylinder(.13, length, [x, y, z - length / 2], steel, 'z', parent);
    cylinder(.19, .25, [x, y, z - length + .08], dark, 'z', parent);
    cylinder(.095, .02, [x, y, z - length - .055], black, 'z', parent);
  }
  function turbine(x, y, z, radius, parent = root) {
    cylinder(radius, .5, [x, y, z], hull, 'y', parent);
    cylinder(radius * .8, .52, [x, y, z], black, 'y', parent);
    const rotor = new THREE.Group(); rotor.position.set(x, y + .28, z); parent.add(rotor);
    cylinder(radius * .16, .18, [0, 0, 0], steel, 'y', rotor);
    for (let i = 0; i < 6; i++) {
      const blade = box([radius * 1.35, .045, .09], [0, 0, 0], steel, rotor);
      blade.rotation.y = i * Math.PI / 3;
    }
    rotors.push(rotor);
    for (const offset of [-.5, .5]) box([.09, .07, radius * 1.85], [x + radius * offset, y + .36, z], dark, parent);
  }

  if (type === 'turret') {
    root.name = 'Sentry / dual 30mm';
    cylinder(1.2, .35, [0, -.8, 0], dark);
    cylinder(.86, .4, [0, -.45, 0], steel);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const leg = box([.38, .3, 1.45], [x * .86, -.88, z * .65], hull); leg.rotation.y = x * z * .6;
      box([.42, .12, .45], [x * 1.24, -1.03, z * 1.12], dark);
    }
    box([1.65, .9, 1.3], [0, .12, .05], hull);
    box([1.3, .18, 1.02], [0, .66, .1], panel);
    for (const x of [-.53, .53]) {
      gun(x, .23, -.5, 1.8);
      box([.38, .55, .7], [x * 1.6, .12, .13], dark);
      for (let i = 0; i < 3; i++) box([.035, .055, .16], [x * 1.98, .3 - i * .13, .13], warning);
    }
    box([.23, .12, .08], [0, .55, -.62], signal);
    cylinder(.05, .8, [.65, 1.01, .5], steel);
  } else if (type === 'gunship' || type === 'boss') {
    root.name = 'Vulture / twin-rotor gunship';
    box([1.6, 1.1, 3.8], [0, .1, 0], hull);
    box([1.35, .26, 3.1], [0, .78, .05], panel);
    const nose = box([1.4, .88, 1.1], [0, -.02, -2.05], hull); nose.rotation.x = -.25;
    box([1.2, .28, .06], [0, .24, -2.6], black);
    box([.12, .13, .07], [0, .24, -2.64], signal);
    box([6.5, .2, .83], [0, .36, .15], dark);
    for (const side of [-1, 1]) {
      box([1.0, .75, 2.1], [side * 2.5, .45, .15], hull);
      box([.8, .12, 1.5], [side * 2.5, .88, .15], panel);
      cylinder(.24, .67, [side * 2.5, 1.16, .15], steel);
      const rotor = new THREE.Group(); rotor.position.set(side * 2.5, 1.52, .15); root.add(rotor);
      cylinder(.23, .18, [0, 0, 0], dark, 'y', rotor);
      for (let i = 0; i < 3; i++) {
        const blade = box([3.1, .045, .2], [0, 0, 0], dark, rotor); blade.rotation.y = i * Math.PI / 3;
      }
      rotors.push(rotor);
      box([.63, .6, 1.7], [side * 1.34, -.5, .15], hull);
      for (const xOffset of [-.14, .14]) for (const yOffset of [-.14, .14]) cylinder(.105, .03, [side * 1.34 + xOffset, -.5 + yOffset, -.72], black, 'z');
      gun(side * .56, -.5, -1.65, 1.2);
      box([.11, .07, .3], [side * 3.04, .65, -.35], signal);
      for (let i = 0; i < 4; i++) box([.04, .36, .095], [side * .82, .2, .65 + i * .2], dark);
    }
    box([.65, .52, 2.4], [0, .35, 2.77], hull);
    const fin = box([.15, 1.4, .95], [0, 1.05, 3.48], panel); fin.rotation.x = -.25;
    box([2.4, .14, .6], [0, .55, 3.4], dark);
    box([.09, .16, .16], [0, 1.75, 3.3], signal);
  } else {
    root.name = 'Razor / armored hover drone';
    box([1.3, .66, 2.15], [0, 0, 0], hull);
    box([1.03, .14, 1.62], [0, .4, .12], panel);
    const nose = box([1.12, .46, .65], [0, -.03, -1.14], hull); nose.rotation.x = -.25;
    box([.85, .13, .07], [0, .08, -1.46], black);
    box([.18, .085, .025], [0, .08, -1.505], signal);
    box([3.7, .12, .58], [0, -.1, .2], dark);
    for (const side of [-1, 1]) {
      turbine(side * 1.43, .08, .19, .72);
      gun(side * .53, -.4, -.65, .85);
      box([.18, .4, .7], [side * .73, .03, .53], dark);
      for (let i = 0; i < 3; i++) box([.035, .19, .075], [side * .83, .13, .35 + i * .15], warning);
      box([.15, .08, .12], [side * 1.97, .2, .72], signal);
    }
    box([.85, .13, .06], [0, .02, 1.12], black);
    cylinder(.055, .5, [.35, .58, .8], steel);
  }

  function bake(group) {
    const batches = new Map();
    for (const child of [...group.children]) {
      if (!child.isMesh) continue;
      child.updateMatrix();
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material).push(child.geometry.clone().applyMatrix4(child.matrix));
      group.remove(child);
    }
    for (const [material, geometries] of batches) {
      group.add(new THREE.Mesh(mergeGeometries(geometries), material));
      geometries.forEach(geometry => geometry.dispose());
    }
  }
  rotors.forEach(bake); bake(root);
  root.userData.update = (dt) => rotors.forEach((rotor, index) => { rotor.rotation.y += dt * (index % 2 ? -24 : 24); });
  root.userData.type = type;
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  root.traverse(object => {
    if (object.geometry) resources.geometries.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      resources.materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
    }
  });
  ownedResources.set(root, resources);
  return root;
}
