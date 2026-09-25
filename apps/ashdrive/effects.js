// Bounded pools keep a long arena session from accumulating meshes/materials.
// All effects use standard materials, so the same scene works in WebGL/WebGPU.
export function createEffects(THREE, scene) {
  const root = new THREE.Group();
  root.name = 'Arena effects';
  scene.add(root);
  const dummy = new THREE.Object3D();
  const direction = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const tint = new THREE.Color();
  const random = (lo, hi) => lo + Math.random() * (hi - lo);

  function texture(smoke = false) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (smoke) {
      gradient.addColorStop(0, 'rgba(210,220,235,.6)');
      gradient.addColorStop(.35, 'rgba(150,166,185,.35)');
      gradient.addColorStop(1, 'rgba(90,105,130,0)');
    } else {
      gradient.addColorStop(0, 'rgba(255,255,240,1)');
      gradient.addColorStop(.16, 'rgba(255,235,150,1)');
      gradient.addColorStop(.4, 'rgba(255,128,28,.65)');
      gradient.addColorStop(1, 'rgba(255,48,0,0)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    if (smoke) {
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(90,80,70,${random(.03, .12)})`;
        ctx.beginPath(); ctx.arc(random(0, 128), random(0, 128), random(3, 12), 0, Math.PI * 2); ctx.fill();
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const fireMap = texture(), smokeMap = texture(true);

  function instancePool(capacity, geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
    const entries = Array.from({ length: capacity }, () => ({ life: 0, total: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, length: 1, heading: 0 }));
    dummy.scale.setScalar(0); dummy.updateMatrix();
    for (let i = 0; i < capacity; i++) { mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color('white')); }
    mesh.count = 0; mesh.visible = false;
    let cursor = 0;
    return { mesh, entries, take(position, color) {
      const index = cursor++ % capacity;
      const p = entries[index];
      p.x = position.x; p.y = position.y; p.z = position.z;
      mesh.count = Math.max(mesh.count, index + 1); mesh.visible = true;
      mesh.setColorAt(index, tint.set(color)); mesh.instanceColor.needsUpdate = true;
      return p;
    } };
  }
  const sparks = instancePool(384, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const debris = instancePool(72, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#697b89', metalness: .8, roughness: .5 }));

  // Additive fire is order independent within its pool: one billboard draw
  // replaces up to 24 sprites. Smoke keeps individual sprites for alpha sorting.
  const fireBatch = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: fireMap, color: '#ffffff', transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }), 24);
  fireBatch.name = 'Batched additive fire billboards';
  fireBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fireBatch.frustumCulled = false;
  for (let i = 0; i < 24; i++) fireBatch.setColorAt(i, tint.setRGB(1, 1, 1));
  fireBatch.instanceColor.setUsage(THREE.DynamicDrawUsage);
  fireBatch.count = 0; fireBatch.visible = false; root.add(fireBatch);
  const billboard = new THREE.Quaternion(), spin = new THREE.Quaternion();
  const clouds = Array.from({ length: 48 }, (_, i) => {
    const smoke = i >= 24;
    let mesh = null;
    if (smoke) {
      const material = new THREE.SpriteMaterial({ map: smokeMap, color: '#8b8274', transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false });
      mesh = new THREE.Sprite(material); mesh.visible = false; root.add(mesh);
    }
    return { mesh, position: mesh ? mesh.position : new THREE.Vector3(), rotation: 0, life: 0, total: 1, size: 1, smoke, vx: 0, vy: 0, vz: 0 };
  });
  let fireCursor = 0, smokeCursor = 24, ringCursor = 0;
  const rings = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffb851', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; root.add(mesh);
    return { mesh, life: 0, total: .7, size: 1 };
  });

  function cloud(position, size, smoke = false) {
    const p = clouds[smoke ? 24 + (smokeCursor++ % 24) : fireCursor++ % 24];
    p.position.copy(position); p.rotation = random(0, Math.PI * 2);
    if (p.mesh) { p.mesh.visible = true; p.mesh.material.rotation = p.rotation; p.mesh.material.opacity = .45; p.mesh.scale.setScalar(size * .4); }
    p.total = p.life = smoke ? random(1.4, 2.4) : random(.3, .65);
    p.size = size;
    p.vx = random(-1, 1); p.vy = smoke ? random(1, 3) : random(.3, 1.5); p.vz = random(-1, 1);
    return p;
  }

  function particles(position, count, scale, color) {
    for (let i = 0; i < count; i++) {
      const p = sparks.take(position, i % 3 === 0 ? '#fff2ac' : color);
      const angle = random(0, Math.PI * 2), force = random(5, 20) * scale;
      p.vx = Math.sin(angle) * force; p.vz = Math.cos(angle) * force; p.vy = random(3, 14) * scale;
      p.total = p.life = random(.3, .85); p.size = random(.04, .11) * scale; p.length = random(.5, 1.8) * scale;
    }
  }

  function explode(position, scale = 1, color = '#ff6c24') {
    scale = Math.max(.1, Math.min(scale, 4));
    particles(position, 40, scale, color);
    cloud(position, 9 * scale);
    for (let i = 0; i < 4; i++) {
      const offset = { x: position.x + random(-1.3, 1.3) * scale, y: position.y + random(-.2, 1.5) * scale, z: position.z + random(-1.3, 1.3) * scale };
      cloud(offset, random(3, 6) * scale);
      cloud(offset, random(3, 5) * scale, true);
    }
    const ring = rings[ringCursor++ % rings.length];
    ring.mesh.visible = true; ring.mesh.position.set(position.x, position.y + .05, position.z);
    ring.mesh.material.color.set(color); ring.mesh.material.opacity = 1;
    ring.life = ring.total = .7; ring.size = scale; ring.mesh.scale.setScalar(.2);
    for (let i = 0; i < 7; i++) {
      const p = debris.take(position, i % 2 ? '#435362' : '#f38c46');
      p.total = p.life = random(.8, 1.5); p.vx = random(-9, 9) * scale; p.vy = random(6, 15) * scale; p.vz = random(-9, 9) * scale;
      p.size = random(.12, .35) * scale; p.length = random(.3, .7) * scale; p.heading = random(0, 6);
    }
  }

  function hit(position, color = '#ffd894') {
    particles(position, 9, .55, color);
    cloud(position, 2.2);
  }

  function trail(position, heading, boosting) {
    const behind = { x: position.x + Math.sin(heading) * 1.7, y: position.y + .35, z: position.z + Math.cos(heading) * 1.7 };
    const p = cloud(behind, boosting ? 1.2 : .6, true);
    p.life = p.total = boosting ? .5 : .3;
    p.vx = Math.sin(heading) * 2; p.vz = Math.cos(heading) * 2; p.vy = .6;
    if (boosting) particles(behind, 2, .2, '#ffad43');
  }

  function animatePool(pool, dt, kind) {
    let changed = false;
    let lastActive = -1;
    for (let i = 0; i < pool.entries.length; i++) {
      const p = pool.entries[i];
      if (p.life <= 0) continue;
      changed = true; p.life = Math.max(0, p.life - dt);
      if (p.life === 0) dummy.scale.setScalar(0);
      else {
        lastActive = i;
        const fade = p.life / p.total;
        if (kind !== 'trail') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.vy -= (kind === 'debris' ? 22 : 15) * dt;
          if (p.y < .1) { p.y = .1; p.vy = Math.abs(p.vy) * .3; p.vx *= .8; p.vz *= .8; }
        }
        dummy.position.set(p.x, p.y, p.z);
        if (kind === 'spark') {
          direction.set(p.vx, p.vy, p.vz).normalize(); dummy.quaternion.setFromUnitVectors(forward, direction);
          dummy.scale.set(p.size * fade, p.size * fade, p.length * Math.sqrt(fade));
        } else {
          dummy.rotation.set(kind === 'debris' ? p.life * 7 : 0, p.heading + (kind === 'debris' ? p.life * 5 : 0), 0);
          dummy.scale.set(p.size * fade, kind === 'trail' ? .035 : p.size * fade, p.length * (kind === 'trail' ? 1 : fade));
        }
      }
      dummy.updateMatrix(); pool.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (changed) pool.mesh.instanceMatrix.needsUpdate = true;
    pool.mesh.count = lastActive + 1;
    pool.mesh.visible = lastActive >= 0;
  }

  function update(dt, camera) {
    animatePool(sparks, dt, 'spark'); animatePool(debris, dt, 'debris');
    if (camera) camera.getWorldQuaternion(billboard);
    let fireCount = 0;
    for (const p of clouds) {
      if (p.life <= 0) continue;
      p.life = Math.max(0, p.life - dt);
      if (p.mesh) p.mesh.visible = p.life > 0;
      const progress = 1 - p.life / p.total;
      p.position.x += p.vx * dt; p.position.y += p.vy * dt; p.position.z += p.vz * dt;
      const size = p.size * (.4 + progress * (p.smoke ? 1.4 : .9));
      const opacity = (p.smoke ? .35 : 1) * (1 - progress) ** (p.smoke ? 1 : 1.8);
      if (p.smoke) {
        p.mesh.scale.setScalar(size); p.mesh.material.opacity = opacity;
      } else if (p.life > 0) {
        dummy.position.copy(p.position); dummy.scale.setScalar(size);
        spin.setFromAxisAngle(forward, p.rotation);
        dummy.quaternion.copy(billboard).multiply(spin); dummy.updateMatrix();
        fireBatch.setMatrixAt(fireCount, dummy.matrix);
        // With additive SrcAlpha blending, RGB*fade gives the same light
        // contribution as the former per-sprite material opacity.
        fireBatch.setColorAt(fireCount, tint.setRGB(opacity, opacity, opacity));
        fireCount++;
      }
    }
    fireBatch.count = fireCount; fireBatch.visible = fireCount > 0;
    if (fireCount) { fireBatch.instanceMatrix.needsUpdate = true; fireBatch.instanceColor.needsUpdate = true; }
    for (const p of rings) {
      if (p.life <= 0) continue;
      p.life = Math.max(0, p.life - dt); p.mesh.visible = p.life > 0;
      const progress = 1 - p.life / p.total;
      p.mesh.scale.setScalar((.2 + progress * 14) * p.size);
      p.mesh.material.opacity = (1 - progress) ** 2 * .8;
    }
  }

  function clear() {
    dummy.scale.setScalar(0); dummy.updateMatrix();
    for (const pool of [sparks, debris]) {
      pool.entries.forEach((p, i) => { p.life = 0; pool.mesh.setMatrixAt(i, dummy.matrix); });
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.mesh.count = 0; pool.mesh.visible = false;
    }
    for (const p of [...clouds, ...rings]) { p.life = 0; if (p.mesh) p.mesh.visible = false; }
    fireBatch.count = 0; fireBatch.visible = false;
  }
  return { explode, hit, trail, update, clear };
}
