// Draw-call diet: bake every static mesh under a group into one mesh per
// material. A bike built from ~55 primitives becomes ~10 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();

// Merge meshes under `group`, skipping anything inside a `keep` subtree.
export function mergeStatic(group, keep = []) {
  const keepSet = new Set(keep.filter(Boolean));
  group.updateWorldMatrix(true, true);
  inv.copy(group.matrixWorld).invert();
  const buckets = new Map();
  const walk = (o) => {
    if (keepSet.has(o)) return;
    for (const c of [...o.children]) walk(c);
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.visible) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
    rel.multiplyMatrices(inv, o.matrixWorld);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(rel);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] });
    buckets.get(key).geos.push(g);
    o.parent.remove(o);
  };
  for (const c of [...group.children]) walk(c);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.renderOrder = b.order;
    group.add(m);
  }
}

// Bike from bikes.js: merge the frame, each wheel, and the rider separately
// so the parts the game animates keep moving independently.
export function optimizeBike(bike) {
  const keep = [bike.rear, bike.front, bike.rider, bike.flame, ...(bike.extras || [])];
  mergeStatic(bike.body, keep);
  mergeStatic(bike.rear, bike.extras);
  mergeStatic(bike.front, bike.extras);
  mergeStatic(bike.rider, [bike.flame, ...(bike.extras || [])]);
  return bike;
}
