/** Loads a baked area (see tools/bake) — area.json + terrain.bin. All coordinates in dm, x east, z south. */
import { A6 } from '../perf/frame';
export interface Building { r: number[][]; h: number; m: number; s: string; rh: number; o: [number, number, number, number, number]; wc: number; rc: number; src?: string }
export interface Road { c: number; w: number; p: number[] }
export interface Pier { poly?: number[]; line?: number[]; w?: number }
export interface AreaData { id: string; name: string; buildings: Building[]; roads: Road[]; pools: number[][]; piers: Pier[]; /** flat [x dm, z dm, kind 0 palm|1 broadleaf, height dm, seed]… */ trees: number[]; /** [x dm, z dm, inferred, arm heading mrad] */ lamps: number[][]; /** fictional ferry dock: dm, heading mrad */ dock?: { x: number; z: number; a: number; name: string } }
export interface Terrain { nx: number; nz: number; cell: number; x0: number; z0: number; h: Float32Array; cover: Uint8Array; heightAt(x: number, z: number): number }

const cache = new Map<string, Promise<{ area: AreaData; terrain: Terrain; mask: ArrayBuffer | null }>>();
let worker: Worker | null = null, seq = 0;
const waiting = new Map<number, { ok: (v: any) => void; err: (e: Error) => void }>();
/** A6: fetch + JSON parse + terrain decode/blur run on a worker, so preloading other areas mid-flight never blocks a frame. */
function viaWorker(id: string, base: string) {
  if (!worker) {
    worker = new Worker(new URL('./area.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const w = waiting.get(e.data.seq); if (!w) return; waiting.delete(e.data.seq); if (e.data.error) w.err(new Error(e.data.error)); else w.ok(e.data); };
  }
  const n = ++seq;
  return new Promise<{ area: AreaData; terrain: Terrain; mask: ArrayBuffer | null }>((ok, err) => {
    waiting.set(n, { ok: (d) => ok({ area: d.area, terrain: makeTerrain(d.terrain), mask: d.mask }), err });
    worker!.postMessage({ seq: n, id, base: new URL(base, location.href).href });
  });
}
/** Fetches (once) and parses an area. Repeated calls share one promise, so preloading makes a later switch instant. */
export function loadArea(id: string) {
  let p = cache.get(id);
  if (!p) {
    const base = `${import.meta.env.BASE_URL}areas/${id}/`;
    p = A6 && typeof Worker !== 'undefined' ? viaWorker(id, base) : Promise.all([
      fetch(base + 'area.json').then((r) => { if (!r.ok) throw new Error(`area ${id}: ${r.status}`); return r.json(); }),
      fetch(base + 'terrain.bin').then((r) => { if (!r.ok) throw new Error(`terrain ${id}: ${r.status}`); return r.arrayBuffer(); }),
      fetch(base + 'ground-mask.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
    ]).then(([area, bin, mask]) => ({ area, terrain: parseTerrain(bin), mask }));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export type TerrainGrid = Omit<Terrain, 'heightAt'>;
export function parseTerrain(buf: ArrayBuffer): Terrain { return makeTerrain(decodeTerrain(buf)); }
/** Pure decode (no closures) so it can run in a worker: header, heights (dm -> m, blurred), cover classes. */
export function decodeTerrain(buf: ArrayBuffer): TerrainGrid {
  const head = new Int32Array(buf, 0, 6);
  if (head[0] !== 0x43545231) throw new Error('terrain.bin: bad magic');
  const [, nx, nz, cellCm, x0Cm, z0Cm] = head;
  const n = nx * nz, hi = new Int16Array(buf, 24, n), cover = new Uint8Array(buf, 24 + n * 2, n).slice();
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = hi[i] / 10;
  // Four box-blur passes soften the 8 m grid so the coastline (0 m contour) reads as a smooth curve, not stairs.
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (src[i] > 2 || src[i] < -2) { let edge = false; for (const j of [i - 1, i + 1, i - nx, i + nx]) if ((src[j] < 0) !== (src[i] < 0)) edge = true; if (!edge) continue; }
      h[i] = (src[i] * 4 + src[i - 1] + src[i + 1] + src[i - nx] + src[i + nx]) / 8;
    }
  }
  return { nx, nz, cell: cellCm / 100, x0: x0Cm / 100, z0: z0Cm / 100, h, cover };
}
/** Bilinear-on-triangles height, same split as the mesh triangles (a-c diagonal) so things sit exactly on the rendered ground. */
export function sampleHeight(t: TerrainGrid, x: number, z: number) {
  const { nx, nz, cell, x0, z0, h } = t;
  const fx = Math.min(Math.max((x - x0) / cell, 0), nx - 1.001), fz = Math.min(Math.max((z - z0) / cell, 0), nz - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * nx + ix;
  const a = h[i], b = h[i + 1], c = h[i + nx + 1], d = h[i + nx];
  return tx > tz ? a + (b - a) * tx + (c - b) * tz : a + (c - d) * tx + (d - a) * tz;
}
export function makeTerrain(g: TerrainGrid): Terrain { return { ...g, heightAt: (x, z) => sampleHeight(g, x, z) }; }
