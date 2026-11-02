import type { AreaData } from '../area/data';
/**
 * Moves a freshly loaded area into the shared world frame: every coordinate in the baked data (buildings, roads, pools, piers, trees, lamps,
 * dock) and the terrain / ground-mask origin is translated by (ox, oz) metres. Done once per load (in the loader worker when there is one),
 * in place, so the rest of the game builds and queries everything directly in world coordinates. ox / oz must be whole metres (the
 * ground mask header stores centimetres as int32).
 */
export function shiftArea(a: AreaData, ox: number, oz: number) {
  const dx = ox * 10, dz = oz * 10; // data is in decimetres
  for (const b of a.buildings) {
    for (const r of b.r) for (let i = 0; i < r.length; i += 2) { r[i] += dx; r[i + 1] += dz; }
    b.o[0] += dx; b.o[1] += dz;
  }
  for (const r of a.roads) for (let i = 0; i < r.p.length; i += 2) { r.p[i] += dx; r.p[i + 1] += dz; }
  for (const p of a.pools) for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dz; }
  for (const p of a.piers) for (const k of ['poly', 'line'] as const) { const v = p[k]; if (v) for (let i = 0; i < v.length; i += 2) { v[i] += dx; v[i + 1] += dz; } }
  for (let i = 0; i < a.trees.length; i += 5) { a.trees[i] += dx; a.trees[i + 1] += dz; }
  for (const l of a.lamps) { l[0] += dx; l[1] += dz; }
  if (a.dock) { a.dock.x += dx; a.dock.z += dz; }
}
export function shiftTerrain(t: { x0: number; z0: number }, ox: number, oz: number) { t.x0 += ox; t.z0 += oz; }
/** ground-mask.bin header: magic, nx, nz, cell cm, x0 cm, z0 cm (int32) */
export function shiftMask(buf: ArrayBuffer | null, ox: number, oz: number) { if (!buf) return; const h = new Int32Array(buf, 0, 6); h[4] += ox * 100; h[5] += oz * 100; }
