// three.js helpers for posing a sprung vehicle built from simple meshes.
// Takes THREE as an argument so this file never pins a second copy of it.

/**
 * Stretch a unit-length mesh along +Y (e.g. CylinderGeometry(r, r, 1)) so it
 * spans from point `a` to point `b` (both in the mesh's parent space).
 */
export function stretchBetween(THREE, mesh, a, b) {
  const dir = mesh.userData._dir || (mesh.userData._dir = new THREE.Vector3());
  dir.subVectors(b, a);
  const length = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  if (length > 1e-6) mesh.quaternion.setFromUnitVectors(Y_AXIS(THREE), dir.divideScalar(length));
  mesh.scale.y = length;
}
let yAxis;
const Y_AXIS = (THREE) => yAxis || (yAxis = new THREE.Vector3(0, 1, 0));

/**
 * Suspension rig: moves wheels along their suspension axes and keeps linked
 * parts (fork legs, swingarms, shocks) attached between frame and axle.
 *
 *   const rig = createSuspensionRig(THREE, {
 *     front: { wheel: frontWheelGroup, axis: forkDirection },   // axis optional, default straight up
 *     rear:  { wheel: rearWheelGroup },
 *     links: [{ mesh: forkLeg, end: 'front', anchor: new THREE.Vector3(...) }],
 *   });
 *   rig.apply({ front: susp.wheelOffset('front'), rear: susp.wheelOffset('rear') });
 *
 * Offsets are vertical metres in the body's space (+ = wheel pushed up into
 * the body). A raked fork slides further along its axis to rise that much.
 * Each link's `anchor` is its frame-side end; the other end follows the axle.
 * Wheels keep their own rotation, so spinning them is unaffected.
 */
export function createSuspensionRig(THREE, { front, rear, links = [] }) {
  const ends = {};
  for (const [name, spec] of Object.entries({ front, rear })) {
    if (!spec?.wheel) continue;
    const axis = (spec.axis ? spec.axis.clone() : new THREE.Vector3(0, 1, 0)).normalize();
    if (axis.y < 0) axis.negate();
    ends[name] = { wheel: spec.wheel, rest: spec.wheel.position.clone(), axis, rise: Math.max(axis.y, 0.3) };
  }
  const axle = new THREE.Vector3();
  const rig = {
    ends,
    links,
    apply(offsets) {
      for (const [name, e] of Object.entries(ends)) {
        const d = (offsets[name] || 0) / e.rise;
        e.wheel.position.copy(e.rest).addScaledVector(e.axis, d);
      }
      for (const link of links) {
        const e = ends[link.end];
        if (!e) continue;
        axle.copy(e.wheel.position);
        if (link.offset) axle.add(link.offset);
        stretchBetween(THREE, link.mesh, link.anchor, axle);
      }
    },
  };
  return rig;
}
