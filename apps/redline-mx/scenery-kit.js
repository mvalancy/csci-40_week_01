// Shared helpers for the scenery builders: batched/merged geometry per
// x-chunk (so frustum culling still works), vertex colours, canvas textures,
// and bookkeeping so dispose() can remove everything.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const X0 = -260; // backdrop spans a bit beyond the track on both ends
export const X1 = 1560;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Transform a geometry in place: {x,y,z, rx,ry,rz, s | sx,sy,sz}
export function T(geo, o = {}) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  const s = o.s ?? 1;
  _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  geo.applyMatrix4(_m.compose(_p, _q, _s));
  return geo;
}

export const mix = (a, b, k) => new THREE.Color(a).lerp(_c.set(b), k);

export function makeKit(ctx) {
  const { scene, biome } = ctx;
  const root = new THREE.Group();
  root.name = 'scenery';
  scene.add(root);
  const owned = new Set(); // geometries, materials, textures to dispose
  const own = (x) => (owned.add(x), x);
  const fogColor = new THREE.Color(biome.fog.color);

  // Colour toward the fog colour: used for distant layers drawn with fog:false.
  const haze = (color, k) => new THREE.Color(color).lerp(fogColor, Math.min(1, Math.max(0, k)));

  const batches = [];
  // A batch collects geometries sharing one material, split by x-chunk.
  function batch(material, { chunk = 160, uv = false, shadow = false, order } = {}) {
    own(material);
    const b = { material, chunk, uv, shadow, order, parts: new Map() };
    b.add = (geo, color = '#fff') => {
      let g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(uv && k === 'uv')) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const pos = g.attributes.position;
      const n = pos.count;
      const col = new Float32Array(n * 3);
      if (typeof color === 'function') {
        const v = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(pos, i);
          const c = color(v, i);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
      } else {
        _c.set(color);
        for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingBox();
      const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
      const key = Math.floor(cx / chunk);
      if (!b.parts.has(key)) b.parts.set(key, []);
      b.parts.get(key).push(g);
      return b;
    };
    batches.push(b);
    return b;
  }

  function flush() {
    for (const b of batches) {
      for (const geos of b.parts.values()) {
        const merged = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(own(merged), b.material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = b.shadow;
        if (b.order != null) mesh.renderOrder = b.order;
        root.add(mesh);
      }
      b.parts.clear();
    }
    batches.length = 0;
  }

  const mats = {
    lit: () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glow: (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, ...o }),
  };

  function add(obj) {
    root.add(obj);
    obj.traverse((o) => {
      if (o.geometry && !o.isSprite) own(o.geometry); // sprites share one global geometry
      if (o.material) [].concat(o.material).forEach((m) => { own(m); if (m.map) own(m.map); });
    });
    return obj;
  }

  function dispose() {
    scene.remove(root);
    root.traverse((o) => { if (o.dispose && o !== root && o.isInstancedMesh) o.dispose(); });
    for (const x of owned) x.dispose?.();
    owned.clear();
  }

  // Instanced mesh helper: matrices from {x,y,z,rx,ry,rz,s,sx,sy,sz}.
  function instanced(geo, material, list, { colors, shadow = false } = {}) {
    const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    list.forEach((o, i) => {
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      _q.setFromEuler(_e);
      const s = o.s ?? 1;
      _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
      _p.set(o.x || 0, o.y || 0, o.z || 0);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
      if (colors) im.setColorAt(i, _c.set(colors(o, i)));
    });
    im.count = list.length;
    im.castShadow = shadow;
    im.computeBoundingSphere();
    add(im);
    return im;
  }

  return { root, own, add, batch, flush, mats, haze, fogColor, instanced, dispose };
}

// Vertex colours already bake in lighting-ish variety; this adds a little noise.
export function jitterColor(base, rng, amt = 0.06) {
  const c = new THREE.Color(base);
  const hsl = {};
  c.getHSL(hsl);
  return c.setHSL(hsl.h + (rng() - 0.5) * amt * 0.3, hsl.s, Math.min(1, Math.max(0, hsl.l + (rng() - 0.5) * amt)));
}

// Merge plain parts into one geometry (position + normal only) for instancing.
export function mergeParts(parts) {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(clean, false);
  clean.forEach((g) => g.dispose());
  return m;
}

// Same, but with a per-part colour baked into a vertex colour attribute.
export function mergeColored(parts) {
  const clean = parts.map(([g, color]) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    const c = new THREE.Color(color);
    const arr = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
    n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return n;
  });
  const m = mergeGeometries(clean, false);
  clean.forEach((g) => g.dispose());
  return m;
}
