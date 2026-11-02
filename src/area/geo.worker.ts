import { makeTerrain, type Building, type AreaData } from './data';
import { buildingSoups, farSoup, CHUNK } from './buildings';
import { roadsSoup, roadChunkRects, roadSegments, terrainGeometry, type Rect } from './ground';
import { compactSoup, compactBuffers, packGeometry, packedBuffers, type CompactGeo, type PackedGeo } from './geom';
import type { AreaStyle } from './textures';

/** Geometry worker: the heavy per-tile mesh generation (roads draped on the terrain, merged building shells, the far-detail building mesh) runs here,
 *  off the main thread, and the page hands back compact welded/quantised typed arrays. The caller terminates the worker afterwards, so all of the
 *  build garbage (millions of temporary vertex arrays) goes back to the OS instead of staying in the page process. */
export interface GeoJob { seq: number; terrain: { nx: number; nz: number; cell: number; x0: number; z0: number; h: Float32Array; cover: Uint8Array }; buildings: Building[]; roads: AreaData['roads']; style: AreaStyle; far: boolean; skip: Rect[] }
export interface GeoResult { seq: number; roads: [string, CompactGeo][]; segs: Float32Array; chunks: [string, CompactGeo][]; far: CompactGeo | null; ground: PackedGeo; count: number; ms: number }

(self as any).onmessage = (e: MessageEvent<GeoJob>) => {
  const j = e.data, t0 = performance.now();
  try {
    const terrain = makeTerrain(j.terrain);
    const roadGeo: [string, CompactGeo][] = [];
    for (const c of roadChunkRects({ roads: j.roads } as AreaData, terrain)) { const rs = roadsSoup({ roads: c.roads } as AreaData, terrain, c.rect); if (!rs.s.empty) roadGeo.push([c.key, compactSoup(rs.s)]); }
    const segs = new Float32Array(roadSegments({ roads: j.roads } as AreaData));
    // one building chunk at a time, compacted and shipped before the next starts (keeps the worker's high-water heap small)
    const groups = new Map<string, Building[]>();
    for (const b of j.buildings) { const k = `${Math.floor(b.o[0] / 10 / CHUNK)},${Math.floor(b.o[1] / 10 / CHUNK)}`; const g = groups.get(k); if (g) g.push(b); else groups.set(k, [b]); }
    const out: [string, CompactGeo][] = []; let count = 0;
    for (const [gk, list] of groups) { const r = buildingSoups(list, terrain, j.style); count += r.count; for (const [k, s] of r.chunks) if (!s.empty) out.push([k, compactSoup(s)]); groups.delete(gk); }
    let far: CompactGeo | null = null;
    if (j.far) { const fs = farSoup(j.buildings, terrain); if (!fs.empty) far = compactSoup(fs); }
    const ground = packGeometry(terrainGeometry(terrain, j.style, j.skip));
    const res: GeoResult = { seq: j.seq, roads: roadGeo, segs, chunks: out, far, ground, count, ms: performance.now() - t0 };
    const xfer: ArrayBuffer[] = [...roadGeo.flatMap(([, g]) => compactBuffers(g)), segs.buffer, ...out.flatMap(([, g]) => compactBuffers(g)), ...(far ? compactBuffers(far) : []), ...packedBuffers(ground)];
    (self as any).postMessage(res, xfer);
  } catch (err) { (self as any).postMessage({ seq: j.seq, error: String((err as Error)?.stack ?? err) }); }
};
