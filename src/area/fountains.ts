/** Animated fountains: two draw calls per area however many fountains stand in it.
 *  - basin water: instanced discs with TSL ripple normals, Fresnel sky reflection and a warm / cool glow that lights the basin at night;
 *  - plumes: instanced ribbons (parabolic jets, a central column, a falling curtain) animated entirely in the shader from `time` (no CPU vertex work). */
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, time, sin, cos, positionLocal, positionWorld, normalize, cameraPosition, dot, max, pow, mix, smoothstep, fract, mx_noise_float, transformNormalToView, instanceIndex, hash, uniform } from 'three/tsl';

export interface FountainSpec { x: number; y: number; z: number; /** basin water radius, m */ radius: number; /** jet height, m */ height: number; /** water surface height over y */ waterY: number; tone: 'sky' | 'neon' | 'coral' | 'gold'; jets?: number }
const TONES: Record<FountainSpec['tone'], [number, number, number][]> = {
  sky: [[0.12, 0.62, 0.78], [0.55, 0.85, 1.0]], neon: [[0.9, 0.1, 0.8], [0.1, 0.9, 1.0]], coral: [[0.1, 0.7, 0.66], [1.0, 0.55, 0.4]], gold: [[0.2, 0.6, 0.7], [1.0, 0.78, 0.4]],
};
export const uFountain = uniform(1); // dev / day-night gain on the fountain glow

function plumeGeometry(nJets: number) {
  const pos: number[] = [], arc: number[] = [], idx: number[] = [];
  const S = 14;
  const ribbon = (f: (t: number) => [number, number, number], tangent: [number, number, number], w: number, kind: number, phase: number) => {
    const b = pos.length / 3;
    for (let i = 0; i <= S; i++) {
      const t = i / S, [x, y, z] = f(t), ww = w * (kind === 2 ? 1 : 1 - 0.55 * t);
      pos.push(x - tangent[0] * ww, y, z - tangent[2] * ww, x + tangent[0] * ww, y, z + tangent[2] * ww);
      arc.push(t, phase, kind, 0, t, phase, kind, 1);
    }
    for (let i = 0; i < S; i++) { const a = b + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  for (let j = 0; j < nJets; j++) { // outward parabolic jets: unit radius 0.85, unit height 0.55
    const a = (j / nJets) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), ph = (j * 0.618) % 1;
    for (const side of [0, 1]) ribbon((t) => [c * 0.85 * t, 0.55 * 4 * t * (1 - t) + 0.02, s * 0.85 * t], [-s * 0.022 * (side ? 0.5 : 1), 0, c * 0.022 * (side ? 0.5 : 1)], 1, 0, (ph + side * 0.31) % 1);
  }
  for (let k = 0; k < 2; k++) ribbon((t) => [0, t * 1.0, 0], [k ? 0 : 0.05, 0, k ? 0.05 : 0], 1, 1, k * 0.4); // central column, unit height 1
  for (let j = 0; j < 20; j++) { // curtain: a falling sheet from a raised ring (unit radius 0.34, from y 0.62 to the water)
    const a0 = (j / 20) * Math.PI * 2, a1 = ((j + 0.8) / 20) * Math.PI * 2, r = 0.34;
    const b = pos.length / 3, y0 = 0.62;
    for (const [aa, side] of [[a0, 0], [a1, 1]] as const) for (let i = 0; i <= 1; i++) { pos.push(Math.cos(aa) * r * (1 + i * 0.1), y0 * (1 - i), Math.sin(aa) * r * (1 + i * 0.1)); arc.push(i, (j * 0.37) % 1, 2, side); }
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('arc', new THREE.Float32BufferAttribute(arc, 4)); g.setIndex(idx);
  return g;
}

export function buildFountains(specs: FountainSpec[]) {
  const group = new THREE.Group(); group.name = 'fountains';
  if (!specs.length) return { group };
  const N = specs.length, m = new THREE.Matrix4(), q = new THREE.Quaternion(), tone = new Float32Array(N * 6);
  // basin water
  const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const wmat = new THREE.MeshStandardNodeMaterial({ transparent: true, opacity: 0.9, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const p = positionWorld, t = time;
  const rip = vec3(mx_noise_float(vec3(p.x.mul(2.2), p.z.mul(2.2), t.mul(1.4))).mul(0.35), 1, mx_noise_float(vec3(p.x.mul(2.0).add(9), p.z.mul(2.4), t.mul(1.2).add(4))).mul(0.35));
  const tA = attribute('toneA', 'vec3'), tB = attribute('toneB', 'vec3');
  const V = normalize(cameraPosition.sub(p)), fres = pow(float(1).sub(max(V.y, 0)), 3);
  const rr = positionLocal.xz.length(); // 0 centre .. 1 rim (disc is unit radius in local space)
  const ringPulse = sin(rr.mul(26).sub(t.mul(3.2))).mul(0.5).add(0.5);
  wmat.colorNode = mix(tA.mul(0.16), vec3(0.01, 0.03, 0.07), rr.mul(0.7)); // dark teal / sapphire depth
  wmat.roughnessNode = float(0.04); wmat.metalnessNode = float(0.1);
  wmat.normalNode = transformNormalToView(normalize(rip));
  const foam = smoothstep(0.74, 0.82, rr).mul(float(1).sub(smoothstep(0.86, 0.95, rr))).mul(mx_noise_float(vec3(p.x.mul(5), p.z.mul(5), t.mul(2.2))).mul(0.35).add(0.75)); // white foam ring where the jets land
  wmat.emissiveNode = tB.mul(float(0.45).add(ringPulse.mul(0.22))).mul(float(1).sub(rr.mul(0.45))).mul(uFountain).add(vec3(0.1, 0.16, 0.26).mul(fres)).add(vec3(0.55, 0.62, 0.66).mul(foam));
  const water = new THREE.InstancedMesh(disc, wmat, N); water.name = 'fountain water';
  // plumes
  const geo = plumeGeometry(Math.max(...specs.map((s) => s.jets ?? 14)));
  const pmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const arc = attribute('arc', 'vec4'), at = arc.x, ph = arc.y, kind = arc.z;
  const flow = fract(at.mul(kind.lessThan(0.5).select(float(1.0), float(1.5))).sub(t.mul(kind.greaterThan(1.5).select(float(0.9), float(0.55)))).add(ph));
  const head = pow(float(1).sub(flow), 2.4);
  const edge = float(1).sub(smoothstep(0.35, 0.5, arc.w.sub(0.5).abs())).mul(0.0).add(1);
  const fall = kind.greaterThan(1.5).select(float(0.35).add(head.mul(0.65)).mul(float(1).sub(at.mul(0.2))), float(0.18).add(head.mul(0.9)));
  const jitter = sin(t.mul(9).add(ph.mul(31)).add(at.mul(18))).mul(0.2).add(0.8);
  pmat.colorNode = mix(tA.mul(1.4).add(0.35), tB.add(0.4), head).mul(fall.mul(jitter).mul(edge)).mul(0.9);
  pmat.opacityNode = fall.mul(float(1).sub(at.mul(kind.lessThan(0.5).select(float(0.0), float(0.0))))).mul(0.8).mul(smoothstep(0.0, 0.06, at.add(kind.greaterThan(0.5).select(float(0.06), float(0))))).mul(float(1).sub(smoothstep(0.94, 1.0, at).mul(kind.lessThan(1.5).select(float(1), float(0)))));
  const plumes = new THREE.InstancedMesh(geo, pmat, N); plumes.name = 'fountain plumes'; plumes.renderOrder = 3;
  void hash; void instanceIndex; void cos; void dot;
  specs.forEach((s, i) => {
    const [a, b] = TONES[s.tone]; tone.set([...a, ...b], i * 6);
    water.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y + s.waterY, s.z), q, new THREE.Vector3(s.radius, 1, s.radius)));
    plumes.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y + s.waterY, s.z), q, new THREE.Vector3(s.radius, s.height, s.radius)));
  });
  for (const mesh of [water, plumes]) {
    const target = mesh === water ? disc : geo;
    target.setAttribute('toneA', new THREE.InstancedBufferAttribute(Float32Array.from({ length: N * 3 }, (_, k) => tone[Math.floor(k / 3) * 6 + (k % 3)]), 3));
    target.setAttribute('toneB', new THREE.InstancedBufferAttribute(Float32Array.from({ length: N * 3 }, (_, k) => tone[Math.floor(k / 3) * 6 + 3 + (k % 3)]), 3));
    mesh.frustumCulled = false; // instance spread is the whole tile; the two meshes are cheap
  }
  group.add(water, plumes);
  return { group };
}
