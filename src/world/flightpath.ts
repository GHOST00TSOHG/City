import * as THREE from 'three/webgpu';
import { positionLocal, float, smoothstep } from 'three/tsl';

/**
 * The Key West fly-over route: Key West is 25 km of open sea south of the Highlands tile, so the way there is a visible flight path:
 * a chain of lit gate rings every 500 m at 150 m altitude along a straight line (instanced, ONE draw call) and a tall light beam over the
 * arrival point (ONE draw call). Both ignore fog so they read from the whole 25 km; their emissive colour is cyan, nothing else in the world is.
 */
export interface FlightPath {
  group: THREE.Group; start: { x: number; z: number }; end: { x: number; z: number }; length: number; gates: number;
  /** distance (m) from a world point to the arrival point, and bearing (rad, clockwise from north = -z) */
  to(x: number, z: number): { dist: number; bearing: number };
  dispose(): void;
}

export function buildFlightPath(start: { x: number; z: number }, end: { x: number; z: number }, opts: { spacing?: number; altitude?: number; radius?: number } = {}): FlightPath {
  const spacing = opts.spacing ?? 500, alt = opts.altitude ?? 150, R = opts.radius ?? 45;
  const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const group = new THREE.Group(); group.name = 'flight-path:keywest';
  const n = Math.floor(length / spacing);
  const geo = new THREE.TorusGeometry(R, 1.6, 6, 32), mat = new THREE.MeshBasicNodeMaterial({ color: 0x4fe0ff, fog: false, toneMapped: false });
  const gates = new THREE.InstancedMesh(geo, mat, Math.max(n, 1)); gates.name = 'flight-gates'; gates.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const t = (i + 1) / (n + 1); gates.setMatrixAt(i, m.compose(p.set(start.x + dx * t, alt + R * 0.1, start.z + dz * t), q, one)); }
  gates.instanceMatrix.needsUpdate = true; gates.count = n;
  // beam over the arrival: open cylinder, additive, fading to nothing at the top
  const H = 2500, bgeo = new THREE.CylinderGeometry(5, 14, H, 16, 1, true).translate(0, H / 2, 0), bmat = new THREE.MeshBasicNodeMaterial({ color: 0x7fe9ff, fog: false, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  bmat.opacityNode = float(0.55).mul(float(1).sub(smoothstep(0, H, positionLocal.y)));
  const beam = new THREE.Mesh(bgeo, bmat); beam.name = 'flight-beam'; beam.position.set(end.x, 0, end.z); beam.frustumCulled = false; beam.renderOrder = 2;
  group.add(gates, beam);
  return { group, start, end, length, gates: n,
    to(x, z) { const ex = end.x - x, ez = end.z - z; return { dist: Math.hypot(ex, ez), bearing: Math.atan2(ex, -ez) }; },
    dispose() { geo.dispose(); mat.dispose(); bgeo.dispose(); bmat.dispose(); } };
}
