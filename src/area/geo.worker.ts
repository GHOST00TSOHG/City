import { makeTerrain, type Building, type AreaData } from './data';
import { buildingSoups, farSoup } from './buildings';
import { roadsSoup, roadSegments, terrainGeometry, type Rect, type Rect4 } from './ground';
import { compactSoup, compactBuffers, packGeometry, packedBuffers, type CompactGeo, type PackedGeo } from './geom';
import type { AreaStyle } from './textures';

/** Geometry worker. The per-tile mesh generation is split into SMALL jobs (one road chunk, one group of building chunks, the far mesh, the terrain mesh),
 *  run one at a time by the client; each result is compacted and transferred (not copied) before the next job starts. WebKit keeps a worker's high-water heap
 *  resident after it is terminated, so the page's RSS is set by the single worst job: keeping every job small is the only lever. */
export type TerrainIn = { nx: number; nz: number; cell: number; x0: number; z0: number; h: Float32Array; cover: Uint8Array };
export type GeoJob =
  | { seq: number; kind: 'roads'; terrain: TerrainIn; roads: AreaData['roads']; rect: Rect4; key: string }
  | { seq: number; kind: 'segs'; roads: AreaData['roads'] }
  | { seq: number; kind: 'bld'; terrain: TerrainIn; buildings: Building[]; style: AreaStyle }
  | { seq: number; kind: 'far'; terrain: TerrainIn; buildings: Building[] }
  | { seq: number; kind: 'ground'; terrain: TerrainIn; style: AreaStyle; skip: Rect[] };
export type GeoResult =
  | { seq: number; kind: 'roads'; key: string; geo: CompactGeo | null }
  | { seq: number; kind: 'segs'; segs: Float32Array }
  | { seq: number; kind: 'bld'; chunks: [string, CompactGeo][]; count: number }
  | { seq: number; kind: 'far'; geo: CompactGeo | null }
  | { seq: number; kind: 'ground'; ground: PackedGeo };

(self as any).onmessage = (e: MessageEvent<GeoJob>) => {
  const j = e.data;
  try {
    let res: GeoResult, xfer: ArrayBuffer[] = [];
    if (j.kind === 'roads') {
      const rs = roadsSoup({ roads: j.roads } as AreaData, makeTerrain(j.terrain), j.rect);
      const geo = rs.s.empty ? null : compactSoup(rs.s); if (geo) xfer = compactBuffers(geo);
      res = { seq: j.seq, kind: 'roads', key: j.key, geo };
    } else if (j.kind === 'segs') {
      const segs = new Float32Array(roadSegments({ roads: j.roads } as AreaData)); xfer = [segs.buffer as ArrayBuffer];
      res = { seq: j.seq, kind: 'segs', segs };
    } else if (j.kind === 'bld') {
      const r = buildingSoups(j.buildings, makeTerrain(j.terrain), j.style), chunks: [string, CompactGeo][] = [];
      for (const [k, s] of r.chunks) if (!s.empty) chunks.push([k, compactSoup(s)]);
      for (const [, g] of chunks) xfer.push(...compactBuffers(g));
      res = { seq: j.seq, kind: 'bld', chunks, count: r.count };
    } else if (j.kind === 'far') {
      const fs = farSoup(j.buildings, makeTerrain(j.terrain)), geo = fs.empty ? null : compactSoup(fs); if (geo) xfer = compactBuffers(geo);
      res = { seq: j.seq, kind: 'far', geo };
    } else {
      const ground = packGeometry(terrainGeometry(makeTerrain(j.terrain), j.style, j.skip)); xfer = packedBuffers(ground);
      res = { seq: j.seq, kind: 'ground', ground };
    }
    (self as any).postMessage(res, xfer);
  } catch (err) { (self as any).postMessage({ seq: j.seq, error: String((err as Error)?.stack ?? err) }); }
};
