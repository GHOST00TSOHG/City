import { makeTerrain, type Building, type AreaData } from './data';
import { buildingSoups, farSoup } from './buildings';
import { roadsSoup } from './ground';
import { compactSoup, compactBuffers, type CompactGeo } from './geom';
import type { AreaStyle } from './textures';

/** Geometry worker: the heavy per-tile mesh generation (roads draped on the terrain, merged building shells, the far-detail building mesh) runs here,
 *  off the main thread, and the page hands back compact welded/quantised typed arrays. The caller terminates the worker afterwards, so all of the
 *  build garbage (millions of temporary vertex arrays) goes back to the OS instead of staying in the page process. */
export interface GeoJob { seq: number; terrain: { nx: number; nz: number; cell: number; x0: number; z0: number; h: Float32Array; cover: Uint8Array }; buildings: Building[]; roads: AreaData['roads']; style: AreaStyle; far: boolean }
export interface GeoResult { seq: number; roads: CompactGeo; segs: Float32Array; chunks: [string, CompactGeo][]; far: CompactGeo | null; count: number; ms: number }

(self as any).onmessage = (e: MessageEvent<GeoJob>) => {
  const j = e.data, t0 = performance.now();
  try {
    const terrain = makeTerrain(j.terrain);
    const roads = roadsSoup({ roads: j.roads } as AreaData, terrain);
    const roadGeo = compactSoup(roads.s); const segs = new Float32Array(roads.segs);
    const { chunks, count } = buildingSoups(j.buildings, terrain, j.style);
    const out: [string, CompactGeo][] = [];
    for (const [k, s] of chunks) { if (!s.empty) out.push([k, compactSoup(s)]); chunks.delete(k); }
    let far: CompactGeo | null = null;
    if (j.far) { const fs = farSoup(j.buildings, terrain); if (!fs.empty) far = compactSoup(fs); }
    const res: GeoResult = { seq: j.seq, roads: roadGeo, segs, chunks: out, far, count, ms: performance.now() - t0 };
    const xfer: ArrayBuffer[] = [...compactBuffers(roadGeo), segs.buffer, ...out.flatMap(([, g]) => compactBuffers(g)), ...(far ? compactBuffers(far) : [])];
    (self as any).postMessage(res, xfer);
  } catch (err) { (self as any).postMessage({ seq: j.seq, error: String((err as Error)?.stack ?? err) }); }
};
