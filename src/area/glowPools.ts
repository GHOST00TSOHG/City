/** Soft light pools for the custom towns: ONE instanced additive quad mesh per area, one pool per real lamp / lantern / floodlight fixture (never free-standing decals).
 *  Falloff is a wide Gaussian times a smoothstep to zero at the quad edge, so there is no hard edge anywhere. */
import * as THREE from 'three/webgpu';
import { uv, length, float, exp, smoothstep, attribute } from 'three/tsl';

export interface GlowSpec { x: number; y: number; z: number; r: number; rgb: [number, number, number]; e: number }
const WARM: [number, number, number] = [1, 0.7, 0.36], COOL: [number, number, number] = [0.75, 0.88, 1], CYAN: [number, number, number] = [0.1, 0.85, 1], MAG: [number, number, number] = [1, 0.12, 0.75];
/** fixture model -> pool radius (m), tint, strength. Anything not listed makes no pool. */
const FIXTURES: [RegExp, number, 'warm' | 'cool' | 'neon', number][] = [
  [/neon_lamppost/, 4.2, 'neon', 0.9],
  [/stone_lantern|andon_lantern|paper_lantern|harvest_lantern|nature\/lantern|oil_lantern|arctic_storm_lantern|hanging_lantern|souk_lanterns/, 2.6, 'warm', 0.7],
  [/streetlamp|reverbere|street_lamp|led_streetlight|lamp_post|gas_lamp|oil_lamp_stand|post_torch|deco_street_lamp|cafe_heatlamp/, 4, 'warm', 0.75],
  [/apron_floodlight|floodlight_tower/, 5, 'cool', 0.4],
];
export function glowFor(path: string, n: number): { r: number; rgb: [number, number, number]; e: number } | null {
  for (const [re, r, tone, e] of FIXTURES) if (re.test(path)) return { r, e, rgb: tone === 'warm' ? WARM : tone === 'cool' ? COOL : n % 2 ? MAG : CYAN };
  return null;
}
export function buildGlowPools(list: GlowSpec[]): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // per-instance RGB lives in its own attribute: setting colorNode would override instanceColor and clip every pool to a white disc
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), col = new Float32Array(list.length * 3);
  list.forEach((g, i) => { col[i * 3] = g.rgb[0] * g.e * 0.26; col[i * 3 + 1] = g.rgb[1] * g.e * 0.26; col[i * 3 + 2] = g.rgb[2] * g.e * 0.26; });
  geo.setAttribute('poolCol', new THREE.InstancedBufferAttribute(col, 3));
  const pcol = attribute('poolCol', 'vec3'), r = length(uv().sub(0.5)).mul(2), fall = exp(r.mul(r).mul(-5.8)).mul(float(1).sub(smoothstep(0.55, 1.0, r)));
  mat.colorNode = pcol.mul(fall); mat.opacityNode = fall; // wide Gaussian, zero at the quad edge: no step anywhere
  const mesh = new THREE.InstancedMesh(geo, mat, list.length); mesh.name = 'town glow pools'; mesh.renderOrder = 2;
  const m = new THREE.Matrix4();
  list.forEach((g, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(g.x, g.y, g.z), new THREE.Quaternion(), new THREE.Vector3(g.r * 2.5, 1, g.r * 2.5))));
  mesh.computeBoundingSphere(); mesh.frustumCulled = false;
  return mesh;
}
