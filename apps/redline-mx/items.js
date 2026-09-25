// Pickups floating over the track: coin rows and coin arcs over ramps,
// plus power-ups. Each type has its own glowing shape so it reads at speed.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const POWERUPS = ['nitro', 'shield', 'ice', 'magnet', 'rocket', 'star'];

function makeMesh(kind) {
  const glow = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3, ...extra });
  let m;
  switch (kind) {
    case 'coin': {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20), glow('#ffcf40', { metalness: 0.9, emissiveIntensity: 0.5 }));
      m.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(m);
      return g;
    }
    case 'nitro': {
      const g = new THREE.Group();
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), glow('#ff3b3b'));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.25, 12), glow('#eeeeee', { emissiveIntensity: 0.2 }));
      cap.position.y = 0.55;
      g.add(can, cap);
      return g;
    }
    case 'shield': {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), glow('#00e5ff', { transparent: true, opacity: 0.55 })));
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), new THREE.MeshBasicMaterial({ color: '#aff', wireframe: true })));
      return g;
    }
    case 'ice': {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), glow('#bff6ff', { transparent: true, opacity: 0.7, emissiveIntensity: 0.5 })));
      return g;
    }
    case 'magnet': {
      const g = new THREE.Group();
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 8, 16, Math.PI), glow('#ff2d95'));
      u.rotation.z = Math.PI;
      const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), glow('#dddddd', { emissiveIntensity: 0.3 }));
      tipL.position.set(-0.4, 0.1, 0);
      const tipR = tipL.clone();
      tipR.position.x = 0.4;
      g.add(u, tipL, tipR);
      return g;
    }
    case 'rocket': {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 12), glow('#ff8a00'));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 12), glow('#ffffff', { emissiveIntensity: 0.3 }));
      nose.position.y = 0.6;
      g.add(body, nose);
      return g;
    }
    case 'ring': {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.16, 10, 40), glow('#ff2d95', { emissiveIntensity: 1.4 }));
      ring.rotation.y = Math.PI / 2; // hoop faces the rider
      const inner = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.05, 6, 40), glow('#ffcf40', { emissiveIntensity: 1.2 }));
      inner.rotation.y = Math.PI / 2;
      g.add(ring, inner);
      return g;
    }
    case 'star': {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.55), glow('#b388ff', { emissiveIntensity: 1.2 })));
      return g;
    }
  }
}

export function createItems(ctx) {
  const { scene, track, LANES, START_X, FINISH_X } = ctx;
  const rng = mulberry32(ctx.biome.seed * 31 + 5);
  const items = [];
  const add = (kind, x, lane, lift = 1.3) => {
    const mesh = makeMesh(kind);
    mesh.traverse((o) => o.isMesh && (o.castShadow = true));
    scene.add(mesh);
    items.push({ kind, x, lane, lift, mesh, taken: false, y: track.height(x) + lift, pull: 0 });
  };

  // Coin rows on flat-ish ground.
  for (let x = START_X + 40; x < FINISH_X - 30; x += 26 + rng() * 30) {
    if (Math.abs(track.slope(x)) > 0.05) continue;
    const lane = Math.floor(rng() * 4);
    for (let i = 0; i < 5; i++) add('coin', x + i * 2.2, lane);
  }
  // Coin arcs above big ramps: only reachable with big air.
  for (const r of track.ramps) {
    if (r.h < 3.5) continue;
    const topEnd = r.x0 + r.up + r.top;
    const lane = Math.floor(rng() * 4);
    for (let i = 0; i < 6; i++) {
      const x = topEnd + 3 + i * 3;
      const arc = Math.sin((i / 5) * Math.PI) * 3.5;
      add('coin', x, lane, r.h + 1.5 + arc - track.height(x));
    }
  }
  // Stunt rings hanging in the air past big ramps: fly through for a bonus.
  for (const r of track.ramps) {
    if (r.h < 3.2) continue;
    const x = r.x0 + r.up + r.top + 9;
    add('ring', x, Math.floor(rng() * 4), r.h + 3.2 - track.height(x));
  }
  // Power-ups, spread out.
  for (let x = START_X + 70; x < FINISH_X - 40; x += 55 + rng() * 45) {
    if (Math.abs(track.slope(x)) > 0.05) continue;
    add(POWERUPS[Math.floor(rng() * POWERUPS.length)], x, Math.floor(rng() * 4), 1.5);
  }

  const counts = () => items.reduce((a, it) => ((a[it.kind] = (a[it.kind] || 0) + 1), a), {});

  return {
    items,
    counts,
    reset() {
      for (const it of items) {
        it.taken = false;
        it.mesh.visible = true;
        it.pull = 0;
        it.mesh.scale.setScalar(1);
      }
    },
    // Returns the kinds collected by `rider` this frame.
    update(dt, time, rider) {
      const got = [];
      const magnet = rider.has('magnet');
      for (const it of items) {
        if (it.taken) continue;
        const dx = it.x - rider.x;
        if (dx < -30 || dx > 90) { it.mesh.visible = false; continue; }
        it.mesh.visible = true;
        const baseY = track.height(it.x) + it.lift;
        let z = LANES[it.lane];
        let y = baseY + Math.sin(time * 3 + it.x) * 0.15;
        let x = it.x;
        // Magnet drags nearby coins into the bike.
        if (magnet && it.kind === 'coin' && dx > -2 && dx < 16) it.pull = Math.min(1, it.pull + dt * 3);
        if (it.pull > 0) {
          x += (rider.x - x) * it.pull;
          y += (rider.y + 1 - y) * it.pull;
          z += (rider.z - z) * it.pull;
        }
        it.mesh.position.set(x, y, z);
        const ring = it.kind === 'ring';
        if (ring) it.mesh.rotation.x = Math.sin(time * 2 + it.x) * 0.15;
        else it.mesh.rotation.y = time * 3 + it.x;
        const near = ring
          ? Math.abs(x - rider.x) < 1.2 && Math.hypot(z - rider.z, y - (rider.y + 1)) < 2.1
          : Math.abs(x - rider.x) < 1.4 && Math.abs(z - rider.z) < 1.3 && Math.abs(y - (rider.y + 1)) < 1.8;
        if (near && !rider.crashed) {
          it.taken = true;
          it.mesh.visible = false;
          got.push(it.kind);
        }
      }
      return got;
    },
  };
}
