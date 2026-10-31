import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, positionLocal, vec3, vec2, sin, cos, float, time, uniform, mix, hash, smoothstep, cameraPosition, distance } from 'three/tsl';
import type { Terrain } from './data';
import { R, MAX, scatterGrass } from './grassScatter';
import { A6, budget } from '../perf/frame';

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


/** Dense grass near the camera: one draw call of instanced blades rebuilt around the camera as it moves.
 *  Wind bends blades (height²), rain wetness darkens and saturates them. Fades out with distance, so no edge. */
export function buildGrass(terrain: Terrain, mask: GroundMask | null) {
  const uWind = uniform(1), uWet = uniform(0), uSnow = uniform(0);
  // blade: 3 segments, 7 verts, unit size (x across, y up)
  const P = [-0.5, 0, 0, 0.5, 0, 0, -0.4, 0.35, 0, 0.4, 0.35, 0, -0.25, 0.7, 0, 0.25, 0.7, 0, 0, 1, 0];
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 0.55 : i % 3 === 2 ? 0.83 : 0)), 3));
  g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6]);
  const buf = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); buf.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('blade', buf); g.instanceCount = 0;
  const b: any = instancedBufferAttribute(buf, "vec4"), seed = b.w, p = positionLocal;
  const ang = seed.mul(6.2831), hgt = mix(float(0.18), float(0.42), hash(seed.mul(911)));
  const fade = float(1).sub(smoothstep(R * 0.6, R * 0.97, distance(cameraPosition.xz, b.xz)));
  const H = hgt.mul(fade).mul(float(1).sub(uSnow.mul(0.85))), W = float(0.045);
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
  mat.colorNode = mix(mix(col, col.mul(vec3(0.6, 0.72, 0.62)), uWet.mul(0.8)), vec3(0.78, 0.8, 0.84), uSnow.mul(t).mul(0.8));
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = 'grass';
  const last = new THREE.Vector3(1e9, 0, 0);
  const plain = mask ? { nx: mask.nx, nz: mask.nz, cell: mask.cell, x0: mask.x0, z0: mask.z0, bits: mask.bits } : null;
  // A6: scatter on a worker. Two buffers ping-pong: the attribute shows one while the worker fills the other.
  let worker: Worker | null = null, spare: Float32Array | null = null, inFlight = false;
  const prev = new THREE.Vector3(1e9, 0, 0), vel = new THREE.Vector3();
  if (A6 && typeof Worker !== 'undefined') {
    worker = new Worker(new URL('./grass.worker.ts', import.meta.url), { type: 'module' });
    const grid = { nx: terrain.nx, nz: terrain.nz, cell: terrain.cell, x0: terrain.x0, z0: terrain.z0, h: terrain.h, cover: terrain.cover };
    worker.postMessage({ init: true, terrain: grid, mask: plain }); spare = new Float32Array(MAX * 4);
    worker.onmessage = (e) => {
      inFlight = false; const { arr, n } = e.data as { arr: Float32Array; n: number };
      if (!visible) { spare = arr; return; } // climbed above grass height while it was in flight
      // copy into the live array (swapping arrays makes the backend reallocate + re-upload the whole buffer)
      (buf.array as Float32Array).set(arr.subarray(0, n * 4)); spare = arr; g.instanceCount = n;
      buf.clearUpdateRanges(); buf.addUpdateRange(0, n * 4); buf.needsUpdate = true; budget.upload(n * 16);
    };
  }
  let visible = false;
  function update(cam: THREE.Vector3) {
    const gy = terrain.heightAt(cam.x, cam.z);
    if (prev.x < 1e8) vel.lerp(prev.sub(cam).negate(), 0.2); prev.copy(cam);
    if (cam.y - gy > 60) { visible = false; if (g.instanceCount) g.instanceCount = 0; last.set(1e9, 0, 0); return; }
    visible = true;
    if (cam.distanceTo(last) < 5) return;
    if (worker) { // prefetch: centre the next patch ~6 frames ahead to cover the worker round trip
      if (inFlight || !spare) return; inFlight = true; last.copy(cam);
      const x = cam.x + vel.x * 6, z = cam.z + vel.z * 6, arr = spare; spare = null;
      worker.postMessage({ x, z, arr }, [arr.buffer]); return;
    }
    last.copy(cam);
    const arr = buf.array as Float32Array, n = scatterGrass(terrain, plain, cam.x, cam.z, arr);
    g.instanceCount = n; buf.needsUpdate = true; buf.clearUpdateRanges(); buf.addUpdateRange(0, n * 4);
  }
  const dispose = () => worker?.terminate();
  return { mesh, update, dispose, uWind, uWet, uSnow, count: () => g.instanceCount, triangles: () => g.instanceCount * 5 };
}
