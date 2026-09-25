import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original procedural city art. No downloaded textures or external assets. */
export function createWorld(THREE, scene) {
  const group = new THREE.Group(); group.name = 'INDUSTRIAL EXCLUSION ZONE'; scene.add(group);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const material = (color, emission = 0, roughness = .65) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emission, metalness: .5, roughness });
  // Dirt is painted into local canvases, keeping the scene completely offline.
  const grit = document.createElement('canvas'); grit.width = grit.height = 256;
  const gc = grit.getContext('2d'); gc.fillStyle = '#77756b'; gc.fillRect(0, 0, 256, 256);
  let textureSeed = 91;
  const noise = () => ((textureSeed = (Math.imul(textureSeed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 18000; i++) { const v = Math.floor(45 + noise() * 120); gc.fillStyle = `rgba(${v},${v},${v - 5},${noise() * .45})`; gc.fillRect(noise() * 256, noise() * 256, 1 + noise() * 3, 1 + noise() * 3); }
  for (let i = 0; i < 35; i++) { gc.strokeStyle = '#22201745'; gc.lineWidth = noise() * 2; gc.beginPath(); let x = noise() * 256, y = noise() * 256; gc.moveTo(x, y); for (let n = 0; n < 5; n++) { x += noise() * 20 - 10; y += noise() * 15; gc.lineTo(x, y); } gc.stroke(); }
  const gritTexture = new THREE.CanvasTexture(grit); gritTexture.colorSpace = THREE.SRGBColorSpace; gritTexture.wrapS = gritTexture.wrapT = THREE.RepeatWrapping;
  const asphalt = material('#55554d'), concrete = material('#a19a86'), steel = material('#505955');
  for (const m of [asphalt, concrete, steel]) { m.map = gritTexture; m.roughness = .91; m.metalness = .12; }
  const cyan = material('#e5bd7d', .65), amber = material('#edaa49', .8), pink = material('#af452c', .35);
  const blue = material('#5a6964', .03), purple = material('#9b8362', .08);
  const rust = material('#845d42'), hazard = material('#bca65e'); rust.map = gritTexture;

  const colliders = [];
  function solidBox(size, position) {
    colliders.push({ minX: position[0] - size[0] / 2, maxX: position[0] + size[0] / 2, minY: position[1] - size[1] / 2, maxY: position[1] + size[1] / 2, minZ: position[2] - size[2] / 2, maxZ: position[2] + size[2] / 2 });
  }
  function pushOut(position, radius = 1) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) for (const c of colliders) {
      if ((position.y ?? 0) > c.maxY - .1 || (position.y ?? 0) + 1.8 < c.minY) continue;
      const x = Math.max(c.minX, Math.min(c.maxX, position.x)), z = Math.max(c.minZ, Math.min(c.maxZ, position.z));
      const dx = position.x - x, dz = position.z - z, squared = dx * dx + dz * dz;
      if (squared >= radius * radius) continue;
      hit = true;
      if (squared > .000001) { const distance = Math.sqrt(squared); position.x = x + dx / distance * (radius + .01); position.z = z + dz / distance * (radius + .01); }
      else {
        const distances = [position.x - c.minX, c.maxX - position.x, position.z - c.minZ, c.maxZ - position.z];
        const direction = distances.indexOf(Math.min(...distances));
        if (direction === 0) position.x = c.minX - radius - .01;
        else if (direction === 1) position.x = c.maxX + radius + .01;
        else if (direction === 2) position.z = c.minZ - radius - .01;
        else position.z = c.maxZ + radius + .01;
      }
    }
    return hit;
  }
  const batches = new Map();
  function block(mat, size, position, rotation = 0) {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ size, position, rotation });
  }
  function mesh(parent, geometry, mat, position, scale) {
    const item = new THREE.Mesh(geometry, mat); item.position.set(...position); if (scale) item.scale.set(...scale); parent.add(item); return item;
  }
  function localBox(parent, size, position, mat) { return mesh(parent, cube, mat, position, size); }
  function bakeStaticChildren(parent, exclude = new Set()) {
    const groups = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || child.isInstancedMesh || exclude.has(child) || child.material.transparent || Array.isArray(child.material)) continue;
      const id = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}`;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(child);
    }
    for (const children of groups.values()) {
      if (children.length < 2) continue;
      const geometries = children.map(child => {
        child.updateMatrix();
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geometry.clearGroups(); geometry.applyMatrix4(child.matrix); return geometry;
      });
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      const result = new THREE.Mesh(merged, children[0].material);
      result.castShadow = children[0].castShadow; result.receiveShadow = children[0].receiveShadow;
      result.name = 'Baked static geometry'; result.matrixAutoUpdate = false; merged.computeBoundingSphere();
      for (const child of children) parent.remove(child);
      parent.add(result);
    }
  }
  let seed = 71994;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  // Atmospheric sky is a local equirectangular canvas, shared by both renderers.
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 1536; skyCanvas.height = 768;
  const skyContext = skyCanvas.getContext('2d');
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 768);
  skyGradient.addColorStop(0, '#252e39'); skyGradient.addColorStop(.22, '#434b50');
  skyGradient.addColorStop(.38, '#8f8270'); skyGradient.addColorStop(.46, '#b49770');
  skyGradient.addColorStop(.5, '#68665a'); skyGradient.addColorStop(1, '#68665a');
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 1536, 768);
  for (let i = 0; i < 110; i++) {
    const x = random() * 1536, y = 100 + random() * 250, width = 50 + random() * 240, height = 6 + random() * 29;
    skyContext.save(); skyContext.translate(x, y); skyContext.scale(width, height);
    const cloud = skyContext.createRadialGradient(0, 0, 0, 0, 0, 1);
    cloud.addColorStop(0, i % 5 === 0 ? '#c7ac7b55' : '#222c3760'); cloud.addColorStop(.55, '#3c41432a'); cloud.addColorStop(1, '#393c4200');
    skyContext.fillStyle = cloud; skyContext.fillRect(-1, -1, 2, 2); skyContext.restore();
  }
  const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace;
  const skyDome = mesh(group, new THREE.SphereGeometry(490, 48, 24), new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false, depthWrite: false }), [0, 0, 0]); skyDome.renderOrder = -100;
  scene.background = new THREE.Color('#68665a'); if (scene.fog) scene.fog.color.set('#68665a');
  // Craggy slag heaps around the distant industrial horizon.
  const slagMaterial = material('#454e48'); slagMaterial.roughness = 1;
  const slagGeometry = new THREE.ConeGeometry(1, 1, 6, 1);
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2, radius = 430 + random() * 40, height = 35 + random() * 85;
    const slag = mesh(group, slagGeometry, slagMaterial, [Math.cos(angle) * radius, height * .34 - 12, Math.sin(angle) * radius], [45 + random() * 65, height, 45 + random() * 45]); slag.rotation.y = random() * Math.PI;
  }
  // A flat combat plaza with two connected elevated freeways. Road surfaces and
  // heightAt share exactly the same profile so ramps are truly rideable.
  const roadMap = [
    { axis: 'z', center: 0, width: 28, plateau: 115, end: 195, height: 12 },
    { axis: 'x', center: -88, width: 24, plateau: 115, end: 195, height: 12 },
  ];
  const profile = (n, r) => Math.max(0, Math.min(1, (r.end - Math.abs(n)) / (r.end - r.plateau))) * r.height;
  function heightAt(x, z, currentY = Infinity) {
    let height = 0;
    for (const r of roadMap) {
      const along = r.axis === 'z' ? z : x, across = r.axis === 'z' ? x : z;
      if (Math.abs(across - r.center) <= r.width / 2 && Math.abs(along) <= r.end) {
        const h = profile(along, r);
        // Pass current altitude to stay below elevated decks. Omit it to query
        // the uppermost road surface (spawning, radar, drone navigation).
        if (h <= currentY + 2.5) height = Math.max(height, h);
      }
    }
    return height;
  }
  // Road planes never change. Reuse their coefficients for every projectile.
  const roadPlanes = roadMap.flatMap(road => {
    const slope = road.height / (road.end - road.plateau);
    return [
      { road, lo: -road.end, hi: -road.plateau, slope, intercept: road.end * slope },
      { road, lo: -road.plateau, hi: road.plateau, slope: 0, intercept: road.height },
      { road, lo: road.plateau, hi: road.end, slope: -slope, intercept: road.end * slope },
    ];
  });
  function segmentHit(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    let nearest = Infinity;
    // Broad-phase interval rejection followed by scalar slab intersection.
    // Avoid temporary per-collider arrays in this high-frequency combat query.
    const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y), maxY = Math.max(from.y, to.y);
    const minZ = Math.min(from.z, to.z), maxZ = Math.max(from.z, to.z);
    const parallelX = Math.abs(dx) < 1e-9, parallelY = Math.abs(dy) < 1e-9, parallelZ = Math.abs(dz) < 1e-9;
    const inverseX = parallelX ? 0 : 1 / dx, inverseY = parallelY ? 0 : 1 / dy, inverseZ = parallelZ ? 0 : 1 / dz;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (maxX < c.minX || minX > c.maxX || maxY < c.minY || minY > c.maxY || maxZ < c.minZ || minZ > c.maxZ) continue;
      let near = 0, far = 1;
      if (parallelX) { if (from.x < c.minX || from.x > c.maxX) continue; }
      else { const a = (c.minX - from.x) * inverseX, b = (c.maxX - from.x) * inverseX; near = Math.max(near, Math.min(a,b)); far = Math.min(far, Math.max(a,b)); }
      if (parallelY) { if (from.y < c.minY || from.y > c.maxY) continue; }
      else { const a = (c.minY - from.y) * inverseY, b = (c.maxY - from.y) * inverseY; near = Math.max(near, Math.min(a,b)); far = Math.min(far, Math.max(a,b)); }
      if (far < near) continue;
      if (parallelZ) { if (from.z < c.minZ || from.z > c.maxZ) continue; }
      else { const a = (c.minZ - from.z) * inverseZ, b = (c.maxZ - from.z) * inverseZ; near = Math.max(near, Math.min(a,b)); far = Math.min(far, Math.max(a,b)); }
      if (far >= near && near <= 1 && far > .0001) nearest = Math.min(nearest, Math.max(.0001, near));
    }
    for (let i = 0; i < roadPlanes.length; i++) {
      const plane = roadPlanes[i], road = plane.road;
      const along = road.axis === 'z' ? from.z : from.x, across = road.axis === 'z' ? from.x : from.z;
      const dAlong = road.axis === 'z' ? dz : dx, dAcross = road.axis === 'z' ? dx : dz;
      const denominator = dy - plane.slope * dAlong;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = (plane.slope * along + plane.intercept - from.y) / denominator;
      const n = along + dAlong * t, cross = across + dAcross * t;
      if (t > .0001 && t <= 1 && n >= plane.lo && n <= plane.hi && Math.abs(cross - road.center) <= road.width / 2) nearest = Math.min(nearest, t);
    }
    if (dy < 0 && from.y > 0) { const t = -from.y / dy; if (t <= 1) nearest = Math.min(nearest, t); }
    return Number.isFinite(nearest) ? { x: from.x + dx * nearest, y: from.y + dy * nearest, z: from.z + dz * nearest, t: nearest } : null;
  }
  const groundMaterial = asphalt.clone(); groundMaterial.map = gritTexture.clone(); groundMaterial.map.repeat.set(70, 70); groundMaterial.map.needsUpdate = true;
  block(groundMaterial, [510, .5, 510], [0, -.3, 0]);
  // Concrete seams, repaired patches, and faded parking bays add scale at speed.
  const patch = material('#464b43'); patch.map = gritTexture;
  for (let i = 0; i < 75; i++) {
    const x = (random() - .5) * 460, z = (random() - .5) * 460;
    block(patch, [2 + random() * 9, .012, 2 + random() * 12], [x, -.025, z], random() * .12);
  }
  for (const x of [-90, 90]) for (let z = 100; z <= 200; z += 12) {
    block(hazard, [11, .02, .12], [x, .012, z]);
    block(hazard, [.12, .02, 12], [x - 5.5, .012, z + 6]);
  }
  const roadVertices = [], roadUVs = [];
  for (const r of roadMap) {
    const position = (across, along, y) => r.axis === 'z' ? [r.center + across, y, along] : [along, y, r.center + across];
    for (let a = -r.end; a < r.end; a += 5) {
      const b = Math.min(r.end, a + 5), ya = profile(a, r), yb = profile(b, r), half = r.width / 2;
      const corners = [position(-half, a, ya), position(half, a, ya), position(half, b, yb), position(-half, b, yb)];
      roadVertices.push(...corners[0], ...corners[2], ...corners[1], ...corners[0], ...corners[3], ...corners[2]);
      roadUVs.push(0,0, r.width / 6,1, r.width / 6,0, 0,0, 0,1, r.width / 6,1);
      const y = (ya + yb) / 2, middle = (a + b) / 2, length = Math.hypot(b - a, yb - ya);
      // Chunky edges below the road make the elevated slab read from the plaza.
      for (const side of [-1, 1]) {
        const size = r.axis === 'z' ? [.8, .75, length + .04] : [length + .04, .75, .8];
        const rotation = r.axis === 'z' ? [-Math.atan2(yb - ya, b - a), 0, 0] : [0, 0, Math.atan2(yb - ya, b - a)];
        block(concrete, size, position(side * (half - .2), middle, y - .38), rotation);
        block(hazard, r.axis === 'z' ? [.15, .04, length] : [length, .04, .15], position(side * (half - .25), middle, y + .03), rotation);
      }
      if (a % 10 === 0) {
        for (const lane of [-r.width / 6, r.width / 6]) {
          block(hazard, r.axis === 'z' ? [.14, .025, 3] : [3, .025, .14], position(lane, middle, y + .035), r.axis === 'z' ? [-Math.atan2(yb - ya, b - a), 0, 0] : [0, 0, Math.atan2(yb - ya, b - a)]);
        }
      }
    }
    for (let a = -105; a <= 105; a += 35) {
      if (r.axis === 'z' && Math.abs(a + 88) < 20) continue;
      for (const side of [-1, 1]) {
        block(concrete, [2, 11.8, 2], position(side * (r.width / 2 - 3), a, 5.8));
        solidBox([2, 11.8, 2], position(side * (r.width / 2 - 3), a, 5.8));
        block(amber, [.2, 3, .2], position(side * (r.width / 2 - 1.9), a - 1.1, 3));
      }
    }
  }
  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
  roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2)); roadGeometry.computeVertexNormals();
  const roadMaterial = asphalt.clone(); roadMaterial.side = THREE.DoubleSide;
  const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial); roadMesh.receiveShadow = roadMesh.castShadow = true; group.add(roadMesh);
  // Ground boulevard stripes and landing-pad circles form readable navigation.
  for (let z = -210; z <= 210; z += 12) {
    for (const x of [-65, 65]) block(amber, [.18, .02, 4], [x, .01, z]);
  }
  for (const [x, z] of [[-68, 50], [76, -18], [100, 150]]) {
    const ring = mesh(group, new THREE.TorusGeometry(14, .12, 6, 64), blue, [x, .04, z]); ring.rotation.x = Math.PI / 2;
    block(blue, [14, .03, .2], [x, .02, z]); block(blue, [.2, .03, 14], [x, .02, z]);
  }
  // Perimeter safety boundary: visual barrier matches the playable extent.
  for (const side of [-1, 1]) {
    block(steel, [480, 1.5, 1.2], [0, .7, side * 242]);
    block(pink, [480, .15, .2], [0, 1.52, side * 242]);
    block(steel, [1.2, 1.5, 480], [side * 242, .7, 0]);
    block(pink, [.2, .15, 480], [side * 242, 1.52, 0]);
  }
  const facades = [material('#6a6a5b'), material('#4f5753'), material('#797468')];
  for (const facade of facades) { facade.map = gritTexture; facade.roughness = .9; }
  for (let i = 0; i < 100; i++) {
    const side = i % 4, along = (random() - .5) * 720, distance = 270 + random() * 110;
    const x = side < 2 ? along : distance * (side === 2 ? 1 : -1);
    const z = side < 2 ? distance * (side === 0 ? 1 : -1) : along;
    const h = 25 + Math.pow(random(), 1.5) * 135, w = 10 + random() * 24, depth = 12 + random() * 22;
    block(facades[i % 3], [w, h, depth], [x, h / 2, z]);
    block(steel, [w * .7, 5, depth * .7], [x, h + 2, z]);
    const light = i % 4 === 0 ? purple : steel;
    for (let y = 8; y < h - 2; y += 7) {
      block(light, [w + .06, .45, depth + .06], [x, y, z]);
    }
    if (i % 3 === 0) {
      block(rust, [.4, h, .4], [x - w / 2 - .06, h / 2, z - depth / 2 - .06]);
      block(steel, [.5, 12, .5], [x, h + 7, z]);
      block(pink, [.6, .6, .6], [x, h + 13, z]);
    }
  }
  function sign(text, subtitle, x, y, z, width = 38, rotation = 0) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#202820'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#ccad69'; ctx.fillRect(0, 0, 12, 256); ctx.fillRect(1012, 0, 12, 256);
    ctx.fillStyle = '#ddd9c2'; ctx.font = 'bold 76px sans-serif'; ctx.fillText(text, 48, 114);
    ctx.fillStyle = '#b9b6a1'; ctx.font = '30px monospace'; ctx.fillText(subtitle, 52, 190);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const panel = mesh(group, new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: .12, side: THREE.DoubleSide }), [x, y, z]); panel.rotation.y = rotation;
    return panel;
  }
  for (const z of [75, -60]) {
    block(steel, [1, 28, 1], [-16, 14, z]); block(steel, [1, 28, 1], [16, 14, z]);
    solidBox([1,28,1], [-16,14,z]); solidBox([1,28,1], [16,14,z]);
    block(steel, [34, 1, 1], [0, 28, z]);
    sign(z > 0 ? 'NORTH / FREEWAY' : 'SECTOR 07 / MILITARY', z > 0 ? '01  //  INDUSTRIAL ACCESS' : 'RESTRICTED AREA  //  LIVE FIRE', 0, 26, z + .6, 29);
  }
  sign('EXCLUSION ZONE', 'UNAUTHORIZED ENTRY / LETHAL FORCE', -105, 28, -240, 72);
  sign('K-7 INDUSTRIAL', 'AUTONOMOUS DEFENSE SECTOR', 105, 42, -250, 65);
  // The low sun and refineries establish a polluted, grounded military city.
  mesh(group, new THREE.SphereGeometry(25, 24, 16), material('#d4ab78', .55), [-170, 128, -370]);
  const smoke = [];
  const smokeGeometry = new THREE.IcosahedronGeometry(1, 1);
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: '#66665a', roughness: 1, transparent: true, opacity: .2, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const x = -235 + i * 57, z = i % 2 ? -270 : 278, height = 42 + random() * 35;
    const stack = mesh(group, new THREE.CylinderGeometry(3.6, 5.4, height, 12), concrete, [x, height / 2, z]);
    for (let y = 12; y < height; y += 14) mesh(group, new THREE.CylinderGeometry(3.8, 4.4, 3.5, 12), rust, [x, y, z]);
    for (let n = 0; n < 5; n++) { const puff = new THREE.Object3D(); puff.position.set(x + n * 5, height + n * 7, z); puff.scale.set(6 + n * 3, 5 + n * 2, 6 + n * 3); smoke.push({ mesh: puff, x: x + n * 5, y: height + n * 7, z, phase: i + n }); }
    block(rust, [25, 9, 25], [x + 16, 4.5, z]);
  }
  const smokeBatch = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, smoke.length);
  smokeBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Puffs span all perimeter refineries and drift slightly. Disabling frustum
  // culling prevents an initial origin-only bound hiding a distant smoke bank.
  smokeBatch.frustumCulled = false;
  smoke.forEach((s,i) => { s.mesh.updateMatrix(); smokeBatch.setMatrixAt(i,s.mesh.matrix); });
  group.add(smokeBatch);
  for (const [x, z] of [[-210,-190],[210,-190],[-220,200],[220,200]]) {
    // Industrial towers stay outside the main combat space.
    block(steel, [3, 48, 3], [x, 24, z]); block(rust, [56, 2.8, 3], [x + 15, 47, z]);
    block(steel, [.15, 22, .15], [x + 39, 35, z]); block(hazard, [3, 2, 3], [x + 39, 23, z]);
    for (let y = 5; y < 46; y += 8) block(rust, [5, .5, 5], [x, y, z]);
    block(concrete, [32, 8, 23], [x - 5, 4, z + 18]);
    solidBox([32,8,23], [x-5,4,z+18]); solidBox([3,48,3], [x,24,z]);
    sign('K-7', 'OPERATIONS', x - 5, 6, z + 30, 14);
  }
  // Cargo yards form cover pockets while preserving generous driving lanes.
  const cargoMaterials = [material('#736947'), material('#705747'), material('#4b635f')];
  for (const m of cargoMaterials) { m.map = gritTexture; m.roughness = .88; }
  const cargoSites = [[-48,40],[48,70],[-130,-25],[145,15],[-115,-145],[95,-145],[155,145],[-150,155]];
  for (let site = 0; site < cargoSites.length; site++) {
    const [x,z] = cargoSites[site], paint = cargoMaterials[site % 3];
    for (let n = 0; n < 3; n++) {
      const px = x + (n % 2) * 9, pz = z + Math.floor(n / 2) * 17, y = 2.7;
      block(paint, [6,5.4,13], [px,y,pz]); solidBox([6,5.4,13], [px,y,pz]);
      for (let rib = -5; rib <= 5; rib += 1.25) {
        block(steel, [.1,5.1,.12], [px-3.05,y,pz+rib]); block(steel, [.1,5.1,.12], [px+3.05,y,pz+rib]);
      }
      block(rust, [6.15,.16,13.15], [px,.15,pz]); block(steel, [6.15,.16,13.15], [px,5.35,pz]);
      block(steel, [.15,4.7,.16], [px,2.7,pz+6.55]);
      for (const offset of [-1.8,1.8]) block(hazard, [.15,.5,.16], [px+offset,1.2,pz+6.6]);
    }
    // A collapsed concrete traffic divider and low bollards announce each yard.
    block(concrete, [13,1.1,1.2], [x+4,.55,z-11]); solidBox([13,1.1,1.2], [x+4,.55,z-11]);
    for (let stripe = -5; stripe <= 5; stripe += 2) block(hazard, [.7,.55,.035], [x+4+stripe,.8,z-10.38], [0,0,-.4]);
    for (const dx of [-5,17]) { block(steel,[.6,4,.6],[x+dx,2,z-10]); block(amber,[.65,.35,.65],[x+dx,4,z-10]); solidBox([.6,4,.6],[x+dx,2,z-10]); }
  }
  // Refinery machinery makes a large mid-distance landmark beside the freeway.
  for (const [x,z] of [[-48,-26],[48,-155],[158,-38]]) {
    for (const dx of [-8,8]) {
      const tank = mesh(group, new THREE.CylinderGeometry(5.8,5.8,14,20), concrete, [x+dx,7,z]); tank.castShadow = tank.receiveShadow = true;
      mesh(group, new THREE.SphereGeometry(5.8,20,10,0,Math.PI*2,0,Math.PI/2), steel, [x+dx,14,z]);
      solidBox([11.6,19.8,11.6], [x+dx,9.9,z]);
      for (const y of [3,11]) { const belt = mesh(group,new THREE.TorusGeometry(5.9,.12,6,24),rust,[x+dx,y,z]); belt.rotation.x = Math.PI/2; }
      block(rust,[.25,16,.35],[x+dx+6,8,z]);
      for (let y=1;y<16;y+=1) block(steel,[1.1,.1,.15],[x+dx+6,y,z+.35]);
    }
    // Service pipes connect the tanks over a small utility shed.
    const pipe = mesh(group,new THREE.CylinderGeometry(.85,.85,29,10),rust,[x,8,z+9]); pipe.rotation.z=Math.PI/2;
    for (const dx of [-14,14]) { mesh(group,new THREE.CylinderGeometry(.85,.85,8,10),rust,[x+dx,4,z+9]); solidBox([1.7,8,1.7],[x+dx,4,z+9]); }
    block(steel,[9,4,8],[x,2,z+22]); solidBox([9,4,8],[x,2,z+22]);
    block(concrete,[11,.4,10],[x,4.2,z+22]);
  }
  // Huge drone carriers, all hard-surface geometry. No expensive point lights.
  const carriers = [];
  function carrier(x, y, z, scale, phase) {
    const ship = new THREE.Group(); ship.position.set(x, y, z); ship.scale.setScalar(scale); group.add(ship);
    localBox(ship, [12, 4, 36], [0, 0, 0], steel);
    localBox(ship, [8, 2.2, 42], [0, 1, -1], concrete);
    localBox(ship, [5, 3, 8], [0, 3.4, 4], steel);
    localBox(ship, [5.1, .8, 4], [0, 3.6, 1.8], cyan);
    localBox(ship, [39, 1.4, 9], [0, -.5, 6], steel);
    localBox(ship, [25, 1, 5], [0, 0, -12], steel);
    for (const side of [-1, 1]) {
      localBox(ship, [5, 5, 25], [side * 16, -1, 5], concrete);
      localBox(ship, [.2, .25, 22], [side * 18.6, -.1, 5], pink);
      localBox(ship, [2.9, 2.9, .4], [side * 16, -1, 17.6], cyan);
      for (const z of [-3, 11]) {
        const turbine = mesh(ship, new THREE.CylinderGeometry(2.5, 3, 1.3, 16), steel, [side * 16, -4, z]);
        mesh(ship, new THREE.CylinderGeometry(1.85, 2.1, .18, 16), cyan, [side * 16, -4.7, z]);
        const halo = mesh(ship, new THREE.TorusGeometry(2.35, .11, 6, 24), cyan, [side * 16, -4.8, z]); halo.rotation.x = Math.PI / 2;
      }
      localBox(ship, [.2, .15, 30], [side * 5.9, -2.1, 0], amber);
    }
    localBox(ship, [3.5, .35, 8], [0, -2.3, -10], amber);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: '#e1c28c', transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide });
    const beam = mesh(ship, new THREE.ConeGeometry(12, y / scale - 5, 20, 1, true), beamMaterial, [0, -(y / scale - 5) / 2 - 3, -5]);
    bakeStaticChildren(ship);
    carriers.push({ ship, x, y, z, phase, beam });
  }
  carrier(-66, 50, -60, 1.1, 0);
  carrier(142, 68, 110, .8, 2.6);
  carrier(-180, 86, -190, .62, 4.3);
  // Distant traffic lanes put motion through the otherwise static skyline.
  const traffic = [];
  const trafficHull = new THREE.InstancedMesh(cube, steel, 18);
  const trafficAmber = new THREE.InstancedMesh(cube, cyan, 9);
  const trafficRed = new THREE.InstancedMesh(cube, pink, 9);
  for (const batch of [trafficHull, trafficAmber, trafficRed]) { batch.frustumCulled = false; batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(batch); }
  for (let i = 0; i < 18; i++) {
    const car = new THREE.Object3D();
    traffic.push({ mesh: car, phase: random() * 600, direction: i % 2 ? 1 : -1, altitude: 38 + (i % 3) * 13 });
  }
  const trafficTransform = new THREE.Object3D(), trafficMatrix = new THREE.Matrix4();
  // Most of the city is submitted in a few instanced draws.
  const transform = new THREE.Object3D();
  for (const [mat, items] of batches) {
    const batch = new THREE.InstancedMesh(cube, mat, items.length);
    items.forEach((item, index) => { transform.position.set(...item.position); transform.scale.set(...item.size); transform.rotation.set(...(Array.isArray(item.rotation) ? item.rotation : [0, item.rotation, 0])); transform.updateMatrix(); batch.setMatrixAt(index, transform.matrix); });
    batch.receiveShadow = mat === groundMaterial || mat === concrete || cargoMaterials.includes(mat);
    batch.castShadow = cargoMaterials.includes(mat);
    batch.matrixAutoUpdate = false; batch.computeBoundingSphere(); group.add(batch);
  }
  bakeStaticChildren(group, new Set([skyDome]));
  let currentQuality;
  return {
    group, bounds: 240, roadMap, heightAt, pushOut, segmentHit,
    setQuality(tier) {
      if (tier === currentQuality) return;
      currentQuality = tier;
      const visible = tier !== 'low';
      smokeBatch.visible = visible;
      for (const batch of [trafficHull, trafficAmber, trafficRed]) batch.visible = visible;
    },
    segmentBlocked(from, to) { return segmentHit(from, to) !== null; },
    spawnPoint: { x: -65, z: 175, y: 0 },
    objectives: [
      { x: -75, z: -88, y: 12, label: 'SKYWAY UPLINK' },
      { x: 80, z: -35, y: 0, label: 'DEFENSE CACHE' },
      { x: -105, z: 85, y: 0, label: 'REFINERY INTEL' },
    ],
    safeHeight(x, z, currentY = Infinity) { return heightAt(Math.max(-240, Math.min(240, x)), Math.max(-240, Math.min(240, z)), currentY); },
    districtAt(x, z) {
      if (Math.abs(x) > 205 || Math.abs(z) > 215) return 'PERIMETER';
      if (z > 115 && x < 15) return 'MOTOR POOL';
      if (z < -65) return 'MILITARY UPLINK';
      if (x < -15 && z < 105) return 'REFINERY';
      return 'CARGO YARDS';
    },
    landmarks: [{ x: 0, z: -88, label: 'SKYWAY' }, { x: -66, z: -60, label: 'CARRIER' }],
    update(dt, time, playerPosition) {
      if (playerPosition) { skyDome.position.x = playerPosition.x; skyDome.position.z = playerPosition.z; }
      if (smokeBatch.visible) {
        for (let i = 0; i < smoke.length; i++) { const s = smoke[i]; s.mesh.position.x = s.x + Math.sin(time * .13 + s.phase) * 3; s.mesh.position.y = s.y + Math.sin(time * .18 + s.phase) * 2; s.mesh.rotation.y = time * .035 + s.phase; s.mesh.updateMatrix(); smokeBatch.setMatrixAt(i,s.mesh.matrix); }
        smokeBatch.instanceMatrix.needsUpdate = true;
      }
      for (const c of carriers) {
        c.ship.position.set(c.x + Math.sin(time * .045 + c.phase) * 25, c.y + Math.sin(time * .4 + c.phase) * 1.6, c.z + Math.cos(time * .035 + c.phase) * 18);
        c.ship.rotation.y = Math.sin(time * .045 + c.phase) * .25;
        c.ship.rotation.z = Math.sin(time * .22 + c.phase) * .025;
      }
      if (trafficHull.visible) for (let i = 0; i < traffic.length; i++) {
        const t = traffic[i];
        t.mesh.position.set(((time * 20 * t.direction + t.phase + 12000) % 600) - 300, t.altitude, -220 + t.altitude * .6);
        t.mesh.rotation.y = -Math.PI / 2 * t.direction; t.mesh.updateMatrix();
        trafficTransform.position.set(0,0,0); trafficTransform.scale.set(1.2,.4,3.5); trafficTransform.updateMatrix();
        trafficMatrix.multiplyMatrices(t.mesh.matrix, trafficTransform.matrix); trafficHull.setMatrixAt(i,trafficMatrix);
        trafficTransform.position.set(0,0,-1.8); trafficTransform.scale.set(.8,.16,.3); trafficTransform.updateMatrix();
        trafficMatrix.multiplyMatrices(t.mesh.matrix, trafficTransform.matrix); (i % 2 ? trafficAmber : trafficRed).setMatrixAt(Math.floor(i/2),trafficMatrix);
      }
      if (trafficHull.visible) trafficHull.instanceMatrix.needsUpdate = trafficAmber.instanceMatrix.needsUpdate = trafficRed.instanceMatrix.needsUpdate = true;
    },
  };
}
