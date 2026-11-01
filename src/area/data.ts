/** Loads a baked area (see tools/bake) — area.json + terrain.bin. All coordinates in dm, x east, z south. */
import { A6 } from '../perf/frame';
import { diag } from '../perf/diag';
export interface Building { r: number[][]; h: number; m: number; s: string; rh: number; o: [number, number, number, number, number]; wc: number; rc: number; src?: string; /** clean-up: floor level and wall-bottom (foundation) y */ pad?: number; fy?: number }
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
    worker.onmessage = diag.wrap((e) => { diag.event('area data msg'); const w = waiting.get(e.data.seq); if (!w) return; waiting.delete(e.data.seq); if (e.data.error) w.err(new Error(e.data.error)); else w.ok(e.data); });
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

import { decodeTerrain, sampleHeight, type TerrainGrid } from './terrainCore';
export { decodeTerrain, sampleHeight, type TerrainGrid };
export function parseTerrain(buf: ArrayBuffer): Terrain { return makeTerrain(decodeTerrain(buf)); }
export function makeTerrain(g: TerrainGrid): Terrain { return { ...g, heightAt: (x, z) => sampleHeight(g, x, z) }; }
