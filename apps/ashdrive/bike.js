import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original procedural remote combat motorcycle. Forward is local negative Z.
// The returned group is the physics frame (tire contact, heading, terrain pitch);
// everything visible hangs off its sprung `body`, which the suspension moves.
export function createCombatBike(THREE) {
  const root = new THREE.Group();
  root.name = 'AD-07 unmanned combat bike';
  const bike = new THREE.Group(); // sprung body
  root.add(bike);
  const material = (color, metalness = .6, roughness = .55) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const armor = material('#7e2725', .65, .6);
  const edge = material('#ae4540', .7, .45);
  const steel = material('#53616a', .85, .4);
  const dark = material('#20272b', .75, .6);
  const rubber = material('#111517', .05, .95);
  const yellow = material('#c6aa56', .4, .75);
  const black = material('#171d20', .45, .7);
  const lamp = new THREE.MeshStandardMaterial({ color: '#e74228', emissive: '#e72d15', emissiveIntensity: 1.2 });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  function box(size, position, mat = armor, parent = bike) {
    const mesh = new THREE.Mesh(boxGeometry, mat); mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  function cylinder(radius, length, position, mat = steel, axis = 'y', radiusTop = radius) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radius, length, 16), mat);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.position.set(...position); bike.add(mesh); return mesh;
  }
  // `axle` marks a suspension link whose `from` end sits on that wheel's axle:
  // it stays unbaked and re-stretches as the wheel moves.
  const links = [];
  function beam(from, to, radius, mat = steel, axle) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const delta = end.clone().sub(start);
    const mesh = cylinder(radius, 1, start.clone().add(end).multiplyScalar(.5).toArray(), mat);
    mesh.scale.y = delta.length();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    if (axle) { mesh.userData.link = true; links.push({ mesh, end: axle, from: start, anchor: end }); }
    return mesh;
  }
  // Thick road tires with separately modelled tread blocks and inset brake discs.
  const wheels = [];
  for (const z of [-1.43, 1.38]) {
    const wheel = new THREE.Group(); wheel.position.set(0, .69, z); bike.add(wheel);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.69, .69, .58, 32), rubber); tire.rotation.z = Math.PI / 2; wheel.add(tire);
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const tread = box([.6, .065, .16], [0, Math.cos(angle) * .687, Math.sin(angle) * .687], black, wheel);
      tread.rotation.x = angle;
    }
    for (const side of [-1, 1]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .06, 24), steel); disc.rotation.z = Math.PI / 2; disc.position.x = side * .32; wheel.add(disc);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .1, 16), dark); hub.rotation.z = Math.PI / 2; hub.position.x = side * .37; wheel.add(hub);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        box([.04, .08, .08], [side * .36, Math.cos(a) * .3, Math.sin(a) * .3], dark, wheel);
      }
    }
    wheels.push(wheel);
  }
  // Chassis and exposed ribbed turbine/drive casing.
  box([.65, .3, 2.45], [0, .85, .1], dark);
  box([.86, .6, 1.1], [0, 1.13, .25], steel);
  for (let z = -.22; z < .8; z += .14) box([.97, .075, .045], [0, 1.28, z], dark);
  for (const side of [-1, 1]) {
    beam([side * .43, .68, 1.38], [side * .48, 1.23, .4], .095, dark, 'rear'); // swingarm
    beam([side * .37, .7, -1.43], [side * .36, 1.68, -.8], .07, steel, 'front'); // fork leg
    const shock = beam([side * .42, .7, 1.36], [side * .42, 1.5, .65], .08, steel, 'rear'); // shock strut
    // Coil spring: one merged mesh in the strut's unit space (y from -.5 to .5),
    // so it rides along and its coils squeeze together as the strut shortens.
    const coils = [];
    for (let t = .275; t < .87; t += .094) coils.push(new THREE.CylinderGeometry(.115, .115, .024, 16).translate(0, t - .5, 0));
    shock.add(new THREE.Mesh(mergeGeometries(coils), dark));
    for (const coil of coils) coil.dispose();
    cylinder(.2, .13, [side * .53, 1.05, .35], steel, 'x');
  }
  // Angular red armored shell, no rider or luminous wheel rims.
  box([.9, .38, 1.64], [0, 1.53, -.05], armor);
  const nose = box([.84, .5, .76], [0, 1.57, -.94], armor); nose.rotation.x = -.25;
  const spine = box([.53, .23, 1.43], [0, 1.85, -.05], edge); spine.rotation.x = .06;
  const tail = box([.9, .27, .77], [0, 1.47, 1.04], armor); tail.rotation.x = .13;
  box([.85, .13, .07], [0, 1.36, 1.46], black);
  for (const x of [-.3, .3]) box([.14, .075, .075], [x, 1.39, 1.5], lamp);
  for (const side of [-1, 1]) {
    const plate = box([.12, .48, 1.35], [side * .52, 1.5, .02], armor); plate.rotation.z = side * .12;
    for (const z of [-.45, .5]) box([.04, .065, .065], [side * .6, 1.65, z], steel);
    // Three diagonal hazard slashes on the shoulder armor.
    for (let i = 0; i < 3; i++) {
      const stripe = box([.025, .2, .085], [side * .592, 1.45, .15 + i * .13], yellow); stripe.rotation.x = -.4;
    }
    // Side cannons with exposed sleeves and dark recessed muzzle bores.
    box([.35, .27, .58], [side * .76, 1.34, -.13], dark);
    cylinder(.14, 1.25, [side * .78, 1.35, -.8], steel, 'z');
    cylinder(.19, .22, [side * .78, 1.35, -1.43], dark, 'z');
    cylinder(.105, .018, [side * .78, 1.35, -1.55], black, 'z');
    for (const z of [-.6, -.85, -1.1]) cylinder(.165, .055, [side * .78, 1.35, z], dark, 'z');
    // Armored twin rocket canisters behind the cannon mount.
    box([.37, .37, .73], [side * .77, 1.54, .76], armor);
    for (const y of [1.45, 1.62]) {
      cylinder(.075, .8, [side * .77, y, .73], dark, 'z');
      cylinder(.053, .02, [side * .77, y, .32], yellow, 'z');
    }
    cylinder(.1, .47, [side * .44, .9, 1.12], dark, 'z');
  }
  // Sensor slit and protective frame replace a human rider.
  box([.48, .15, .13], [0, 1.95, -.54], black);
  box([.2, .045, .015], [0, 1.95, -.612], material('#7fadb0', .5, .3));
  beam([-.32, 1.78, -.32], [-.32, 2.03, .48], .035, dark);
  beam([.32, 1.78, -.32], [.32, 2.03, .48], .035, dark);
  beam([-.32, 2.03, .48], [.32, 2.03, .48], .035, dark);
  // Bake detail by material: dozens of bolts/treads become only a few draw calls.
  function bake(group) {
    const batches = new Map();
    for (const child of [...group.children]) {
      if (!child.isMesh || child.userData.link) continue;
      child.updateMatrix();
      const geometry = child.geometry.clone().applyMatrix4(child.matrix);
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material).push(geometry);
      group.remove(child);
    }
    for (const [mat, geometries] of batches) {
      const combined = mergeGeometries(geometries);
      group.add(new THREE.Mesh(combined, mat));
      for (const geometry of geometries) geometry.dispose();
    }
  }
  for (const wheel of wheels) bake(wheel);
  bake(bike);
  // Link ends are stored relative to their wheel centre so they follow the axle.
  const [front, rear] = wheels;
  for (const link of links) link.offset = link.from.clone().sub((link.end === 'front' ? front : rear).position);
  root.userData.body = bike;
  root.userData.wheels = wheels;
  root.userData.front = front;
  root.userData.rear = rear;
  root.userData.links = links;
  root.userData.wheelbase = rear.position.z - front.position.z;
  root.userData.update = (distance) => { for (const wheel of wheels) wheel.rotation.x -= distance / .69; };
  return root;
}
