import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original procedural mission machinery. No assets or runtime network requests.
export function createMission(THREE, scene, world) {
  const group = new THREE.Group(); group.name = 'Military data recovery mission'; scene.add(group);
  const material = (color, metalness = .6, roughness = .65) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const steel = material('#68716b'), olive = material('#50543b'), dark = material('#252b2a'), yellow = material('#d3ad55', .25), red = material('#8e3c2d');
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const lampMaterial = () => new THREE.MeshStandardMaterial({ color: '#e3b750', emissive: '#ac6f1c', emissiveIntensity: .7 });
  function box(parent, size, position, mat) {
    const mesh = new THREE.Mesh(cube, mat); mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  function cylinder(parent, radius, height, position, mat, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), mat); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  // Bake only direct static siblings. Animated radar/intel groups and
  // independently flashing indicator/beacon meshes retain their own objects.
  function batchStatic(parent, dynamic = new Set()) {
    const byMaterial = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || dynamic.has(child) || child.material.transparent) continue;
      const key = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}`;
      if (!byMaterial.has(key)) byMaterial.set(key, []);
      byMaterial.get(key).push(child);
    }
    for (const children of byMaterial.values()) {
      if (children.length < 2) continue;
      const parts = children.map(child => {
        child.updateMatrix();
        const part = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        part.clearGroups(); part.applyMatrix4(child.matrix); return part;
      });
      const geometry = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, children[0].material);
      mesh.name = 'Batched mission machinery'; mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
      mesh.castShadow = children[0].castShadow; mesh.receiveShadow = children[0].receiveShadow;
      for (const child of children) parent.remove(child);
      parent.add(mesh);
    }
  }
  const targets = world.objectives.map((point, index) => {
    const mesh = new THREE.Group(); mesh.name = point.label || `RELAY ${index + 1}`;
    mesh.position.set(point.x, (point.y ?? 0) + 1.5, point.z); group.add(mesh);
    box(mesh, [7, .4, 6], [0, -1.3, 0], dark);
    const equipment = new THREE.Group(); mesh.add(equipment);
    box(equipment, [4.5, 2.4, 3.2], [0, .1, 0], olive);
    box(equipment, [4.7, .18, 3.4], [0, 1.38, 0], steel);
    for (const x of [-1.8, 1.8]) {
      box(equipment, [.3, 2.5, 3.5], [x, .1, 0], dark);
      box(equipment, [.45, .6, .08], [x, .5, -1.77], yellow);
    }
    for (let n = 0; n < 6; n++) box(equipment, [.12, 1, .1], [-.9 + n * .35, .25, -1.66], dark);
    cylinder(equipment, .17, 2, [0, 2.3, 0], steel);
    const radar = new THREE.Group(); radar.position.set(0, 3.3, 0); equipment.add(radar);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    dish.rotation.x = Math.PI * .66; radar.add(dish);
    box(radar, [.09, .09, 1.8], [0, 0, -.7], dark);
    const indicator = box(equipment, [.9, .2, .1], [0, 1, -1.68], lampMaterial());
    // Stencilled-looking floor corners and an amber survey pole mark the site.
    for (const x of [-3.2, 3.2]) for (const z of [-2.7, 2.7]) {
      box(mesh, [1.2, .04, .2], [x, -1.07, z], yellow);
      box(mesh, [.2, .04, 1.2], [x, -1.07, z], yellow);
    }
    cylinder(mesh, .07, 5, [3, 1, 2], steel, 6);
    const beacon = box(mesh, [.3, .45, .3], [3, 3.5, 2], lampMaterial());
    const intel = new THREE.Group(); intel.position.set(0, .4, 0); mesh.add(intel);
    box(intel, [1.5, .7, 1], [0, 0, 0], dark);
    box(intel, [1.6, .16, 1.1], [0, .35, 0], yellow);
    box(intel, [.6, .08, .1], [0, .12, -.52], lampMaterial());
    intel.visible = false;
    batchStatic(equipment, new Set([indicator]));
    batchStatic(mesh, new Set([beacon]));
    return { mesh, position: mesh.position, health: 6, maxHealth: 6, label: mesh.name, destroyed: false, recovered: false, equipment, radar, indicator, beacon, intel, flash: 0 };
  });
  const extraction = new THREE.Vector3(world.spawnPoint.x, world.spawnPoint.y ?? 12, world.spawnPoint.z);
  const pad = new THREE.Group(); pad.position.copy(extraction); group.add(pad);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(8.5, 9, 48), new THREE.MeshBasicMaterial({ color: '#72725b', side: THREE.DoubleSide, transparent: true, opacity: .7 }));
  padRing.rotation.x = -Math.PI / 2; padRing.position.y = .08; pad.add(padRing);
  box(pad, [1.1, .06, 8], [-2.5, .09, 0], yellow); box(pad, [1.1, .06, 8], [2.5, .09, 0], yellow); box(pad, [5, .06, 1.1], [0, .09, 0], yellow);
  const padLampMaterial = lampMaterial();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(pad, [.5, .25, .5], [Math.sin(a) * 9, .2, Math.cos(a) * 9], padLampMaterial); }
  batchStatic(pad);
  let time = 0, complete = false;
  const lastPosition = extraction.clone();
  function reset() {
    time = 0; complete = false; lastPosition.copy(extraction);
    for (const target of targets) {
      target.health = target.maxHealth; target.destroyed = false; target.recovered = false; target.flash = 0;
      target.equipment.visible = true; target.equipment.rotation.set(0, 0, 0); target.intel.visible = false;
      target.beacon.visible = true; target.indicator.material.color.set('#e3b750'); target.beacon.material.color.set('#e3b750');
    }
    padRing.material.color.set('#72725b');
  }
  function hit(target, damage = 1) {
    if (!targets.includes(target) || target.destroyed || !Number.isFinite(damage) || damage <= 0 || complete) return false;
    target.health = Math.max(0, target.health - damage); target.flash = .18;
    if (target.health > 0) return false;
    target.destroyed = true; target.equipment.visible = false; target.intel.visible = true;
    target.beacon.material.color.set('#dde6a1');
    return true;
  }
  function update(dt, playerPosition) {
    if (!playerPosition || !Number.isFinite(dt)) return;
    time += Math.max(0, Math.min(dt, .1)); lastPosition.copy(playerPosition);
    for (const target of targets) {
      target.radar.rotation.y += Math.max(0, dt) * .7;
      target.flash = Math.max(0, target.flash - dt);
      target.indicator.material.emissiveIntensity = target.flash > 0 ? 3 : .5 + .25 * Math.sin(time * 4);
      target.beacon.material.emissiveIntensity = target.recovered ? .05 : .6 + .25 * Math.sin(time * 3);
      if (target.destroyed && !target.recovered) {
        target.intel.rotation.y = time * .65;
        target.intel.position.y = .35 + Math.sin(time * 2) * .18;
        if (lastPosition.distanceTo(target.position) < 10) { target.recovered = true; target.intel.visible = false; target.beacon.visible = false; }
      }
    }
    const ready = targets.every(target => target.recovered);
    padRing.material.color.set(ready ? '#c9ba6a' : '#72725b');
    padLampMaterial.emissiveIntensity = ready ? .8 + .3 * Math.sin(time * 4) : .08;
    if (ready && lastPosition.distanceTo(extraction) < 10) complete = true;
  }
  function snapshot() {
    const destroyed = targets.filter(target => target.destroyed).length;
    const recovered = targets.filter(target => target.recovered).length;
    const remaining = targets.filter(target => !target.recovered);
    remaining.sort((a, b) => lastPosition.distanceToSquared(a.position) - lastPosition.distanceToSquared(b.position));
    const next = remaining[0];
    const phase = complete ? 'complete' : recovered === targets.length ? 'extract' : next?.destroyed ? 'recover' : 'destroy';
    const objectiveText = complete ? 'MISSION COMPLETE / INTEL SECURED' : phase === 'extract' ? 'RETURN TO MOTORPOOL EXTRACTION' : phase === 'recover' ? `RECOVER ${next.label} / APPROACH CACHE` : `DISABLE ${next.label} / CANNON OR MISSILES`;
    const position = next ? next.position : extraction;
    return { destroyed, recovered, complete, phase, objectiveText, targetLabel: next?.label || 'MOTORPOOL EXTRACTION', targetIndex: next ? targets.indexOf(next) : -1, targetPosition: { x: position.x, y: position.y, z: position.z }, total: targets.length };
  }
  reset();
  return { targets, extraction, reset, hit, update, snapshot };
}
