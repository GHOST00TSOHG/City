import * as THREE from 'three/webgpu';

/** Growable Float32 list: a quarter of the memory of number[] for big merged meshes (the road mesh alone is millions of vertices). */
export class Grow {
  a = new Float32Array(1 << 14); length = 0;
  private room(n: number) { if (this.length + n > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.length + n)); b.set(this.a.subarray(0, this.length)); this.a = b; } }
  push3(x: number, y: number, z: number) { this.room(3); const a = this.a, l = this.length; a[l] = x; a[l + 1] = y; a[l + 2] = z; this.length = l + 3; }
  push4(x: number, y: number, z: number, w: number) { this.room(4); const a = this.a, l = this.length; a[l] = x; a[l + 1] = y; a[l + 2] = z; a[l + 3] = w; this.length = l + 4; }
  /** exact-size copy (frees the spare capacity) */
  take() { return this.a.slice(0, this.length); }
}

/** Facade attribute packing (snorm16 x4): heights as (y - Y0) / YS, the kind/material pack as k / KS (integers <= 127), seed 0..1 as is. facade.ts decodes with the same constants. */
export const FACADE_Y0 = 150, FACADE_YS = 300, FACADE_KS = 128;
export interface CompactGeo { position: Float32Array; normal: Int8Array; color: Uint8Array; facade: Int16Array | null; index: Uint16Array | Uint32Array; /** minX minY minZ maxX maxY maxZ */ bounds: number[] }
/** Transferable buffers of a CompactGeo (for worker -> main). */
export const compactBuffers = (c: CompactGeo) => [c.position.buffer, c.normal.buffer, c.color.buffer, c.index.buffer, ...(c.facade ? [c.facade.buffer] : [])] as ArrayBuffer[];
export function applyCompact(g: THREE.BufferGeometry, c: CompactGeo) {
  g.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(c.normal, 4, true));
  g.setAttribute('color', new THREE.BufferAttribute(c.color, 4, true));
  if (c.facade) g.setAttribute('facade', new THREE.BufferAttribute(c.facade, 4, true));
  g.setIndex(new THREE.BufferAttribute(c.index, 1));
  const b = c.bounds; g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])); g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
}

/** Triangle soup that welds as it goes: each corner is quantised (normal Int8 snorm, colour Uint8 unorm, facade Int16 snorm; positions stay Float32 because
 *  world coordinates reach 23 km) and looked up in an open-addressing hash, so equal corners share one vertex and only the unique vertices plus a 32-bit
 *  index per corner are ever stored (no multi-hundred-MB temporary soup for a 2 M triangle road mesh). Flat normals; colours linear. */
export class Soup {
  private cap = 1 << 12; private nu = 0; private ni = 0; private idx = new Uint32Array(1 << 14);
  private P = new Float32Array(this.cap * 3); private Pu = new Uint32Array(this.P.buffer);
  private N8 = new Int8Array(this.cap * 4); private Nu = new Uint32Array(this.N8.buffer);
  private C8 = new Uint8Array(this.cap * 4); private Cu = new Uint32Array(this.C8.buffer);
  private F16: Int16Array | null = null; private Fu: Uint32Array | null = null;
  private table = new Int32Array(this.cap * 2).fill(-1);
  private sP = new Float32Array(3); private sPu = new Uint32Array(this.sP.buffer);
  private sN = new Int8Array(4); private sNu = new Uint32Array(this.sN.buffer);
  private sC = new Uint8Array(4); private sCu = new Uint32Array(this.sC.buffer);
  private sF = new Int16Array(4); private sFu = new Uint32Array(this.sF.buffer);
  /** Per-vertex facade data [baseY, wallTopY, kind pack, seed] is written when enabled (before the first triangle). */
  cur: [number, number, number, number] = [0, 0, 0, 0];
  /** Vertex-colour alpha (0..255) written with every corner: road surfaces use it as a surface-kind tag (asphalt 255, sidewalk 200, curb 150). */
  alpha = 255;
  enableFacade() { this.F16 = new Int16Array(this.cap * 4); this.Fu = new Uint32Array(this.F16.buffer); }
  private static e1 = new THREE.Vector3(); private static e2 = new THREE.Vector3(); private static nn = new THREE.Vector3();

  private grow() {
    const cap = this.cap * 2, P = new Float32Array(cap * 3), N8 = new Int8Array(cap * 4), C8 = new Uint8Array(cap * 4);
    P.set(this.P); N8.set(this.N8); C8.set(this.C8);
    this.P = P; this.Pu = new Uint32Array(P.buffer); this.N8 = N8; this.Nu = new Uint32Array(N8.buffer); this.C8 = C8; this.Cu = new Uint32Array(C8.buffer);
    if (this.F16) { const F = new Int16Array(cap * 4); F.set(this.F16); this.F16 = F; this.Fu = new Uint32Array(F.buffer); }
    this.cap = cap; this.table = new Int32Array(cap * 2).fill(-1);
    for (let u = 0; u < this.nu; u++) this.insert(u);
  }
  private hash(u: number) {
    const a = u * 3, Pu = this.Pu;
    let h = Math.imul(Pu[a], 0x9e3779b1) ^ Math.imul(Pu[a + 1], 0x85ebca6b) ^ Math.imul(Pu[a + 2], 0xc2b2ae35) ^ Math.imul(this.Nu[u], 0x27d4eb2f) ^ Math.imul(this.Cu[u], 0x165667b1);
    if (this.Fu) h ^= Math.imul(this.Fu[u * 2], 0x61c88647) ^ Math.imul(this.Fu[u * 2 + 1], 0x7feb352d);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0;
  }
  private insert(u: number) { const m = this.table.length - 1; let s = this.hash(u) & m; while (this.table[s] !== -1) s = (s + 1) & m; this.table[s] = u; }

  /** Adds a corner (from the scratch buffers) and its index. */
  private corner(): void {
    const sPu = this.sPu, sNu = this.sNu[0], sCu = this.sCu[0], F = this.Fu !== null;
    let h = Math.imul(sPu[0], 0x9e3779b1) ^ Math.imul(sPu[1], 0x85ebca6b) ^ Math.imul(sPu[2], 0xc2b2ae35) ^ Math.imul(sNu, 0x27d4eb2f) ^ Math.imul(sCu, 0x165667b1);
    const f0 = this.sFu[0], f1 = this.sFu[1];
    if (F) h ^= Math.imul(f0, 0x61c88647) ^ Math.imul(f1, 0x7feb352d);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    const m = this.table.length - 1; let slot = (h >>> 0) & m, u = -1;
    for (;;) {
      const v = this.table[slot]; if (v < 0) break;
      const a = v * 3;
      if (this.Pu[a] === sPu[0] && this.Pu[a + 1] === sPu[1] && this.Pu[a + 2] === sPu[2] && this.Nu[v] === sNu && this.Cu[v] === sCu && (!F || (this.Fu![v * 2] === f0 && this.Fu![v * 2 + 1] === f1))) { u = v; break; }
      slot = (slot + 1) & m;
    }
    if (u < 0) {
      if (this.nu === this.cap) { this.grow(); this.corner(); return; }
      u = this.nu++; this.table[slot] = u;
      this.P[u * 3] = this.sP[0]; this.P[u * 3 + 1] = this.sP[1]; this.P[u * 3 + 2] = this.sP[2];
      this.Nu[u] = sNu; this.Cu[u] = sCu; if (F) { this.Fu![u * 2] = f0; this.Fu![u * 2 + 1] = f1; }
    }
    if (this.ni === this.idx.length) { const b = new Uint32Array(this.idx.length * 2); b.set(this.idx); this.idx = b; }
    this.idx[this.ni++] = u;
  }
  private put(v: number[], nx: number, ny: number, nz: number, r: number, g: number, b: number) {
    this.sP[0] = v[0]; this.sP[1] = v[1]; this.sP[2] = v[2];
    const sN = this.sN, sC = this.sC;
    sN[0] = Math.round(nx * 127); sN[1] = Math.round(ny * 127); sN[2] = Math.round(nz * 127); sN[3] = 0;
    sC[0] = Math.round(Math.min(1, Math.max(0, r)) * 255); sC[1] = Math.round(Math.min(1, Math.max(0, g)) * 255); sC[2] = Math.round(Math.min(1, Math.max(0, b)) * 255); sC[3] = this.alpha;
    if (this.F16) {
      const c = this.cur, sF = this.sF, sn = (x: number) => Math.round(Math.min(1, Math.max(-1, x)) * 32767);
      sF[0] = sn((c[0] - FACADE_Y0) / FACADE_YS); sF[1] = sn((c[1] - FACADE_Y0) / FACADE_YS); sF[2] = sn(c[2] / FACADE_KS); sF[3] = sn(c[3]);
    }
    this.corner();
  }
  /** Adds triangle; flips winding so the face normal points along `hint` (or computed normal if no hint). */
  tri(a: number[], b: number[], c: number[], col: THREE.Color, hint?: [number, number, number], shade: [number, number, number] = [1, 1, 1]) {
    const e1 = Soup.e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = Soup.e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = Soup.nn.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-10) return;
    n.normalize();
    let s = shade;
    if (hint && n.x * hint[0] + n.y * hint[1] + n.z * hint[2] < 0) { const t = b; b = c; c = t; n.negate(); s = [shade[0], shade[2], shade[1]]; }
    this.put(a, n.x, n.y, n.z, col.r * s[0], col.g * s[0], col.b * s[0]);
    this.put(b, n.x, n.y, n.z, col.r * s[1], col.g * s[1], col.b * s[1]);
    this.put(c, n.x, n.y, n.z, col.r * s[2], col.g * s[2], col.b * s[2]);
  }
  quad(a: number[], b: number[], c: number[], d: number[], col: THREE.Color, hint?: [number, number, number], shade?: [number, number, number, number]) {
    const s = shade ?? [1, 1, 1, 1];
    this.tri(a, b, c, col, hint, [s[0], s[1], s[2]]); this.tri(a, c, d, col, hint, [s[0], s[2], s[3]]);
  }
  get empty() { return this.ni === 0; }
  /** Exact-size compact arrays (transferable). Empties the soup. */
  finish(): CompactGeo {
    const n = this.nu, P = this.P.slice(0, n * 3);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let u = 0; u < n; u++) { const x = P[u * 3], y = P[u * 3 + 1], z = P[u * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const index = n < 65536 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    const out: CompactGeo = { position: P, normal: this.N8.slice(0, n * 4), color: this.C8.slice(0, n * 4), facade: this.F16 ? this.F16.slice(0, n * 4) : null, index, bounds: n ? [x0, y0, z0, x1, y1, z1] : [0, 0, 0, 0, 0, 0] };
    this.table = new Int32Array(1); this.P = new Float32Array(0); this.idx = new Uint32Array(0); this.nu = this.ni = 0;
    return out;
  }
  geometry() { const g = new THREE.BufferGeometry(); applyCompact(g, this.finish()); return g; }
}
export const compactSoup = (s: Soup) => s.finish();

/** A BufferGeometry as plain transferable data (worker -> main) and back. */
export interface PackedGeo { attrs: { name: string; array: ArrayBufferView; itemSize: number; normalized: boolean }[]; index: Uint16Array | Uint32Array | null; sphere: [number, number, number, number]; box: number[] }
export function packGeometry(g: THREE.BufferGeometry): PackedGeo {
  g.computeBoundingSphere(); g.computeBoundingBox();
  const s = g.boundingSphere!, b = g.boundingBox!;
  return { attrs: Object.entries(g.attributes).map(([name, a]) => ({ name, array: a.array, itemSize: a.itemSize, normalized: a.normalized })), index: g.index ? (g.index.array as Uint16Array | Uint32Array) : null, sphere: [s.center.x, s.center.y, s.center.z, s.radius], box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z] };
}
export const packedBuffers = (p: PackedGeo) => [...p.attrs.map((a) => a.array.buffer as ArrayBuffer), ...(p.index ? [p.index.buffer as ArrayBuffer] : [])];
export function unpackGeometry(p: PackedGeo) {
  const g = new THREE.BufferGeometry();
  for (const a of p.attrs) g.setAttribute(a.name, new THREE.BufferAttribute(a.array as any, a.itemSize, a.normalized));
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(p.sphere[0], p.sphere[1], p.sphere[2]), p.sphere[3]);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(p.box[0], p.box[1], p.box[2]), new THREE.Vector3(p.box[3], p.box[4], p.box[5]));
  return g;
}

/** Release the CPU copy of a static mesh's vertex data after its first draw (the GPU buffer holds it; WebKit unified memory counts both). The attributes keep
 *  their type and count with an empty array; the byte total goes to `geometry.userData.gpuBytes` for the memory tools. Do not edit the mesh afterwards. */
const KEEP_CPU = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('keepcpu') : null; // regex of mesh names to keep (1 = all)
export function freeCpuAfterFirstDraw(mesh: THREE.Mesh) {
  if (KEEP_CPU && (KEEP_CPU === '1' || new RegExp(KEEP_CPU).test(mesh.name))) return;
  mesh.onAfterRender = (renderer: any) => {
    const g = mesh.geometry, list = [...Object.values(g.attributes), g.index] as (THREE.BufferAttribute | null)[];
    // only once every buffer exists on the GPU (a compile-only pass can call onAfterRender before the geometry is uploaded)
    for (const at of list) { if (!at?.array?.length) continue; const d = renderer.backend?.get?.(at); if (!d || !(d.buffer || d.bufferGPU)) return; }
    mesh.onAfterRender = () => {};
    let bytes = 0;
    for (const at of list) { if (!at?.array?.length) continue; bytes += at.array.byteLength; at.array = new (at.array.constructor as any)(0); }
    g.userData.gpuBytes = bytes;
  };
}

export const ringPts = (r: number[]) => { const out: [number, number][] = []; for (let i = 0; i < r.length; i += 2) out.push([r[i] / 10, r[i + 1] / 10]); return out; };
export const signedArea = (pts: [number, number][]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** Flat horizontal polygon (with holes) at height y, facing up. */
export function flatPoly(s: Soup, outer: [number, number][], holes: [number, number][][], y: number | ((x: number, z: number) => number), col: THREE.Color, down = false) {
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z)), hs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const all = [...contour, ...hs.flat()];
  let idx: number[][];
  try { idx = THREE.ShapeUtils.triangulateShape(contour, hs); } catch { return; }
  const Y = typeof y === 'number' ? () => y : y;
  const hint: [number, number, number] = down ? [0, -1, 0] : [0, 1, 0];
  for (const [i, j, k] of idx) { const a = all[i], b = all[j], c = all[k]; if (!a || !b || !c) continue; s.tri([a.x, Y(a.x, a.y), a.y], [b.x, Y(b.x, b.y), b.y], [c.x, Y(c.x, c.y), c.y], col, hint); }
}
