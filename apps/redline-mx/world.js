// The race course itself, styled by the biome: sky, lights, ground, track
// mesh, mud/ice/oil patches, cooling pads, arches, signs, dust, confetti.
// Backdrops, crowds, animals and weather live in their own modules.
import * as THREE from 'three';
import { LANES, TRACK_HALF_WIDTH, FINISH_X, START_X } from './track.js';
import { mulberry32 } from './rng.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildWorld(scene, track, biome) {
  const rng = mulberry32(99);

  // Sky gradient + fog
  scene.background = canvasTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, biome.sky[0]);
    grad.addColorStop(0.55, biome.sky[1]);
    grad.addColorStop(1, biome.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(biome.fog.color, biome.fog.near, biome.fog.far);

  const hemi = new THREE.HemisphereLight(biome.hemi.sky, biome.hemi.ground, biome.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(biome.sun.color, biome.sun.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 25, bottom: -25, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Grass
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 400),
    new THREE.MeshStandardMaterial({ color: biome.ground, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(600, -0.02, 0);
  grass.receiveShadow = true;
  scene.add(grass);

  // Track surface: dirt texture with lane lines, extruded from the height profile.
  const dirt = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = biome.dirt.base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? biome.dirt.dark : biome.dirt.light},${0.15 + rng() * 0.25})`;
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 3, 2 + rng() * 3);
    }
    g.fillStyle = biome.dirt.lines;
    for (const z of [-3, 0, 3]) {
      const v = ((z + TRACK_HALF_WIDTH) / (TRACK_HALF_WIDTH * 2)) * h;
      for (let x = 0; x < w; x += 32) g.fillRect(x, v - 1.5, 18, 3);
    }
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 4, w, 4);
  });
  dirt.wrapS = THREE.RepeatWrapping;

  const xs = [];
  for (let x = track.begin; x <= track.end; x += 0.5) xs.push(x);
  const top = [];
  const uv = [];
  const idx = [];
  const skirt = [];
  const skirtIdx = [];
  xs.forEach((x, i) => {
    const y = track.height(x);
    top.push(x, y, -TRACK_HALF_WIDTH, x, y, TRACK_HALF_WIDTH);
    uv.push(x / 10, 0, x / 10, 1);
    skirt.push(x, y, TRACK_HALF_WIDTH, x, -0.02, TRACK_HALF_WIDTH);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      skirtIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  topGeo.setIndex(idx);
  topGeo.computeVertexNormals();
  const surface = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: dirt, roughness: 0.95 }));
  surface.receiveShadow = true;
  scene.add(surface);

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3));
  skirtGeo.setIndex(skirtIdx);
  skirtGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({ color: biome.dirt.skirt, roughness: 1, side: THREE.DoubleSide })));

  // Mud patches (dark, glossy) and cooling pads (glowing blue chevrons).
  const mudMat = new THREE.MeshStandardMaterial({ color: biome.mud, roughness: 0.3, metalness: 0.1,
    emissive: biome.id === 'volcano' || biome.id === 'neon' ? biome.mud : '#000', emissiveIntensity: 0.6 });
  for (const m of track.mud) {
    for (const lane of m.lanes) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(m.x1 - m.x0, 2.6), mudMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set((m.x0 + m.x1) / 2, track.height(m.x0) + 0.03, LANES[lane]);
      p.receiveShadow = true;
      scene.add(p);
    }
  }
  const chevron = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#0af';
    g.beginPath();
    g.moveTo(10, 10); g.lineTo(70, 64); g.lineTo(10, 118); g.lineTo(40, 118); g.lineTo(100, 64); g.lineTo(40, 10);
    g.fill();
  });
  const coolMat = new THREE.MeshBasicMaterial({ map: chevron, transparent: true, color: '#9ff' });
  const boostMat = new THREE.MeshBasicMaterial({ map: chevron, transparent: true, color: '#ff9a3c' });
  for (const c of track.boosts || []) {
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), boostMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(c.x - 2 + k * 1.6, track.height(c.x) + 0.04, LANES[c.lane]);
      scene.add(p);
    }
  }
  for (const c of track.coolers) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), coolMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(c.x, track.height(c.x) + 0.04, LANES[c.lane]);
    scene.add(p);
  }

  // Hay bales along the far edge.
  const bales = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: { canyon: '#c98a4a', alpine: '#e8f0f8', neon: '#ff2d95', volcano: '#6b4a2a' }[biome.id] || '#e0c060', roughness: 1, emissive: biome.night ? '#ff2d95' : '#000', emissiveIntensity: biome.night ? 0.4 : 0 }),
    Math.ceil((track.end - track.begin) / 2.2)
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  for (let i = 0; i < bales.count; i++) {
    const x = track.begin + i * 2.2;
    m4.compose(new THREE.Vector3(x, track.height(x) + 0.7, -TRACK_HALF_WIDTH - 0.8), q, new THREE.Vector3(1, 1, 1));
    bales.setMatrixAt(i, m4);
  }
  bales.castShadow = true;
  scene.add(bales);

  const col = new THREE.Color();
  const len = track.end - track.begin;

  // Start + finish arches.
  const arch = (x, label, colors) => {
    const g = new THREE.Group();
    const post = new THREE.MeshStandardMaterial({ color: '#eee' });
    for (const z of [-7.5, 7.5]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), post);
      p.position.set(0, 3.5, z);
      p.castShadow = true;
      g.add(p);
    }
    const tex = canvasTexture(512, 64, (c, w, h) => {
      for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? colors[0] : colors[1];
        c.fillRect(i * 16, j * 16, 16, 16);
      }
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(150, 8, 212, 48);
      c.fillStyle = '#fff'; c.font = 'bold italic 40px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, 256, 34);
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 15.4), [1, 1, 0, 0, 0, 0].map((k) => (k ? new THREE.MeshBasicMaterial({ map: tex }) : post)));
    banner.position.y = 6.6;
    // The banner spans the track (z); its +x/-x faces carry the texture and face the riders.
    g.add(banner);
    g.position.set(x, track.height(x), 0);
    scene.add(g);
    // Checkered line on the ground
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, TRACK_HALF_WIDTH * 2), new THREE.MeshBasicMaterial({ map: tex }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, track.height(x) + 0.03, 0);
    scene.add(line);
  };
  arch(START_X, 'START', ['#111', '#fff']);
  arch(FINISH_X, 'FINISH', ['#111', '#fff']);

  // Distance signs every 100m
  for (let x = 100; x < FINISH_X; x += 100) {
    const tex = canvasTexture(128, 64, (c) => {
      c.fillStyle = '#ffcf40'; c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#111'; c.font = 'bold 38px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(`${x}m`, 64, 34);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
    s.position.set(x, 3.2, -TRACK_HALF_WIDTH - 2);
    scene.add(s);
  }

  // Dust particles (pooled sprites).
  const dustTex = canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(230,200,160,1)');
    grad.addColorStop(1, 'rgba(230,200,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  const dust = [];
  for (let i = 0; i < 220; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    scene.add(s);
    dust.push({ s, life: 0, v: new THREE.Vector3() });
  }
  let dustI = 0;
  const puff = (x, y, z, amount = 1, color) => {
    const d = dust[dustI++ % dust.length];
    d.life = 1;
    d.max = 0.5 + Math.random() * 0.5;
    d.s.position.set(x, y + 0.2, z + (Math.random() - 0.5) * 0.6);
    d.v.set(-2 - Math.random() * 3, 1 + Math.random() * 2.5 * amount, (Math.random() - 0.5) * 2);
    d.s.material.color.set(color || '#ffffff');
    d.s.visible = true;
  };
  const updateDust = (dt) => {
    for (const d of dust) {
      if (!d.s.visible) continue;
      d.life -= dt / d.max;
      if (d.life <= 0) { d.s.visible = false; continue; }
      d.s.position.addScaledVector(d.v, dt);
      d.v.y -= 2 * dt;
      const k = 1 - d.life;
      d.s.scale.setScalar(0.6 + k * 2.2);
      d.s.material.opacity = d.life * 0.7;
    }
  };

  // Confetti: one InstancedMesh, simple per-piece physics with flutter.
  const MAX_CONFETTI = 600;
  const confetti = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.28, 0.16),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    MAX_CONFETTI
  );
  confetti.frustumCulled = false;
  const pieces = [];
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_CONFETTI; i++) {
    confetti.setMatrixAt(i, hidden);
    confetti.setColorAt(i, col.setHSL(i / MAX_CONFETTI, 0.9, 0.6));
    pieces.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
  }
  scene.add(confetti);
  let confettiI = 0;
  const celebrate = (x, y, count = 200) => {
    for (let i = 0; i < count; i++) {
      const c = pieces[confettiI++ % MAX_CONFETTI];
      c.life = 2.5 + Math.random() * 1.5;
      c.p.set(x + (Math.random() - 0.5) * 4, y + Math.random() * 2, (Math.random() - 0.5) * 10);
      c.v.set((Math.random() - 0.3) * 14, 8 + Math.random() * 14, (Math.random() - 0.5) * 10);
      c.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    }
  };
  const q2 = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const updateConfetti = (dt) => {
    let any = false;
    pieces.forEach((c, i) => {
      if (c.life <= 0) return;
      any = true;
      c.life -= dt;
      c.v.y -= 14 * dt;
      c.v.multiplyScalar(1 - 1.8 * dt); // air drag → flutter down slowly
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      m4.compose(c.p, q2.setFromEuler(c.r), one);
      confetti.setMatrixAt(i, c.life > 0 ? m4 : hidden);
    });
    if (any) confetti.instanceMatrix.needsUpdate = true;
  };

  return { sun, hemi, puff, updateDust, celebrate, updateConfetti };
}
