import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, positionLocal, vec3, vec2, sin, cos, float, time, uniform, mix, hash, smoothstep, cameraPosition, distance } from 'three/tsl';
import type { Terrain } from './data';

/** Ground mask (bake: ground-mask.bin): 2 m cells, bit set = building, pool or road, no grass. */
export interface GroundMask { nx: number; nz: number; cell: number; x0: number; z0: number; bits: Uint8Array; blocked(x: number, z: number): boolean }
export function parseGroundMask(buf: ArrayBuffer): GroundMask {
  const h = new Int32Array(buf, 0, 6); if (h[0] !== 0x4f434331) throw new Error('ground-mask.bin: bad magic');
  const [, nx, nz, cellCm, x0Cm, z0Cm] = h, cell = cellCm / 100, x0 = x0Cm / 100, z0 = z0Cm / 100, bits = new Uint8Array(buf, 24);
  return { nx, nz, cell, x0, z0, bits, blocked(x, z) {
    const ix = Math.round((x - x0) / cell), iz = Math.round((z - z0) / cell);
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return true; const j = iz * nx + ix; return (bits[j >> 3] >> (j & 7) & 1) === 1;
  } };
}

const R = 40, DENS = 22, MAX = 140000; // radius m, blades per m², cap
// cover classes that grow grass: land (yards) 0, grass 1, wetland 5, pitch 6
const GROWS: Record<number, number> = { 0: 0.75, 1: 1, 5: 0.6, 6: 1 };

/** Dense grass near the camera: one draw call of instanced blades rebuilt around the camera as it moves.
 *  Wind bends blades (height²), rain wetness darkens and saturates them. Fades out with distance, so no edge. */
export function buildGrass(terrain: Terrain, mask: GroundMask | null) {
  const uWind = uniform(1), uWet = uniform(0);
  // blade: 3 segments, 7 verts, unit size (x across, y up)
  const P = [-0.5, 0, 0, 0.5, 0, 0, -0.4, 0.35, 0, 0.4, 0.35, 0, -0.25, 0.7, 0, 0.25, 0.7, 0, 0, 1, 0];
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6]);
  const buf = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); buf.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('blade', buf); g.instanceCount = 0;
  const b: any = instancedBufferAttribute(buf, "vec4"), seed = b.w, p = positionLocal;
  const ang = seed.mul(6.2831), hgt = mix(float(0.18), float(0.42), hash(seed.mul(911)));
  const fade = float(1).sub(smoothstep(R * 0.6, R * 0.97, distance(cameraPosition.xz, b.xz)));
  const H = hgt.mul(fade), W = float(0.045);
  const t = p.y, bend = t.mul(t).mul(H);
  const gust = sin(time.mul(1.7).add(b.x.mul(0.21)).add(b.z.mul(0.13))).mul(0.5).add(0.5);
  const lean = bend.mul(float(0.25).add(gust.mul(0.55).mul(uWind))).add(bend.mul(sin(time.mul(4.1).add(seed.mul(40))).mul(0.06)));
  const across = vec2(cos(ang), sin(ang)).mul(p.x).mul(W);
  const wind = vec2(0.8, 0.6).mul(lean);
  (g as any).boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
  mat.positionNode = vec3(b.x.add(across.x).add(wind.x), b.y.add(t.mul(H)).sub(bend.mul(0.25)), b.z.add(across.y).add(wind.y));
  const hue = hash(seed.mul(173));
  const base = mix(vec3(0.05, 0.09, 0.03), vec3(0.08, 0.11, 0.035), hue), tip = mix(vec3(0.2, 0.3, 0.09), vec3(0.27, 0.33, 0.11), hue);
  const col = mix(base, tip, t);
  mat.colorNode = mix(col, col.mul(vec3(0.6, 0.72, 0.62)), uWet.mul(0.8));
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = 'grass';
  const last = new THREE.Vector3(1e9, 0, 0), arr = buf.array as Float32Array;
  const coverAt = (x: number, z: number) => { const ix = Math.round((x - terrain.x0) / terrain.cell), iz = Math.round((z - terrain.z0) / terrain.cell);
    return ix < 0 || iz < 0 || ix >= terrain.nx || iz >= terrain.nz ? 255 : terrain.cover[iz * terrain.nx + ix]; };
  const h2 = (a: number, b: number, c: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function update(cam: THREE.Vector3) {
    const gy = terrain.heightAt(cam.x, cam.z);
    if (cam.y - gy > 60) { if (g.instanceCount) g.instanceCount = 0; last.set(1e9, 0, 0); return; }
    if (cam.distanceTo(last) < 5) return; last.copy(cam);
    let n = 0; const cx = Math.floor(cam.x), cz = Math.floor(cam.z);
    for (let gz = cz - R; gz <= cz + R && n < MAX; gz++) for (let gx = cx - R; gx <= cx + R && n < MAX; gx++) {
      const dx = gx + 0.5 - cam.x, dz = gz + 0.5 - cam.z; if (dx * dx + dz * dz > R * R) continue;
      const grow = GROWS[coverAt(gx + 0.5, gz + 0.5)]; if (!grow) continue;
      if (mask && mask.blocked(gx + 0.5, gz + 0.5)) continue;
      const y0 = terrain.heightAt(gx + 0.5, gz + 0.5); if (y0 < 0.25) continue;
      const k = Math.floor(DENS * grow * (0.6 + h2(gx, gz, 7) * 0.8));
      for (let i = 0; i < k && n < MAX; i++) {
        const x = gx + h2(gx, gz, i * 3 + 1), z = gz + h2(gx, gz, i * 3 + 2);
        arr[n * 4] = x; arr[n * 4 + 1] = terrain.heightAt(x, z) - 0.02; arr[n * 4 + 2] = z; arr[n * 4 + 3] = h2(gx, gz, i * 3 + 3); n++;
      }
    }
    g.instanceCount = n; buf.needsUpdate = true; buf.clearUpdateRanges(); buf.addUpdateRange(0, n * 4);
  }
  return { mesh, update, uWind, uWet, count: () => g.instanceCount, triangles: () => g.instanceCount * 5 };
}
