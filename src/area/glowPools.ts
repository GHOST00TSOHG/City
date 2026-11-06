/** Soft light pools for the custom towns: ONE instanced additive quad mesh per area, one pool per real lamp / lantern / floodlight fixture (never free-standing decals).
 *  Falloff is a smooth radial alpha `pow(max(0, 1 - r^2), 2.2)`, so there is no hard edge anywhere. */
import * as THREE from 'three/webgpu';
import { uv, length, float, pow, max, vec3 } from 'three/tsl';

export interface GlowSpec { x: number; y: number; z: number; r: number; rgb: [number, number, number]; e: number }
const WARM: [number, number, number] = [1, 0.7, 0.36], COOL: [number, number, number] = [0.75, 0.88, 1], CYAN: [number, number, number] = [0.1, 0.85, 1], MAG: [number, number, number] = [1, 0.12, 0.75];
/** fixture model -> pool radius (m), tint, strength. Anything not listed makes no pool. */
const FIXTURES: [RegExp, number, 'warm' | 'cool' | 'neon', number][] = [
  [/neon_lamppost/, 4.2, 'neon', 0.9],
  [/stone_lantern|andon_lantern|paper_lantern|harvest_lantern|nature\/lantern|oil_lantern|arctic_storm_lantern|hanging_lantern|souk_lanterns/, 2.6, 'warm', 0.7],
  [/streetlamp|street_lamp|led_streetlight|lamp_post|gas_lamp|oil_lamp_stand|post_torch|deco_street_lamp|cafe_heatlamp/, 4, 'warm', 0.75],
  [/apron_floodlight|floodlight_tower/, 5, 'cool', 0.4],
];
export function glowFor(path: string, n: number): { r: number; rgb: [number, number, number]; e: number } | null {
  for (const [re, r, tone, e] of FIXTURES) if (re.test(path)) return { r, e, rgb: tone === 'warm' ? WARM : tone === 'cool' ? COOL : n % 2 ? MAG : CYAN };
  return null;
}
export function buildGlowPools(list: GlowSpec[]): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const r = length(uv().sub(0.5)).mul(2), a = pow(max(float(0), float(1).sub(r.mul(r))), 2.2);
  mat.colorNode = vec3(1, 1, 1); mat.opacityNode = a; // instance colour (tint x strength) multiplies the colour; additive blend gives colour * alpha
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, list.length); mesh.name = 'town glow pools'; mesh.renderOrder = 2;
  const m = new THREE.Matrix4(), c = new THREE.Color();
  list.forEach((g, i) => { mesh.setMatrixAt(i, m.compose(new THREE.Vector3(g.x, g.y, g.z), new THREE.Quaternion(), new THREE.Vector3(g.r * 2, 1, g.r * 2))); mesh.setColorAt(i, c.setRGB(g.rgb[0] * g.e, g.rgb[1] * g.e, g.rgb[2] * g.e)); });
  mesh.computeBoundingSphere(); mesh.frustumCulled = false;
  return mesh;
}
