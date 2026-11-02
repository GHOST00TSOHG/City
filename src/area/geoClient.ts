import * as THREE from 'three/webgpu';
import type { Building, AreaData, Terrain } from './data';
import type { AreaStyle } from './textures';
import type { GeoResult } from './geo.worker';
import { applyCompact, unpackGeometry, type CompactGeo } from './geom';
import { buildBuildings, buildBuildingsFar, CHUNK } from './buildings';
import { buildRoads, buildTerrain, roadSurfaceFrom, roadChunkRects, type RoadSurface, type Rect } from './ground';

const QS = new URLSearchParams(location.search);
const USE_WORKER = typeof Worker !== 'undefined' && QS.get('geoworker') !== '0';
const SKIP = (QS.get('skipgeo') ?? '').split(','); // debug flag, see run() below
const BLD_JOB = Number(QS.get('bldjob') ?? 2500); // buildings per worker job (whole 600 m chunks)
export interface TileGeo { roads: THREE.Group & { surface: RoadSurface }; blds: { group: THREE.Group; count: number }; far: THREE.Mesh; ground: THREE.Mesh; workerMs: number }

const geometryOf = (c: CompactGeo) => { const g = new THREE.BufferGeometry(); applyCompact(g, c); return g; };

/** Builds the roads, building chunks and far-detail buildings of one tile. In a short-lived worker when available, as a sequence of SMALL jobs (one road
 *  chunk, a few building chunks, ...) so the worker's high-water heap, which WebKit keeps resident, is that of the worst small job; inline otherwise
 *  (`?geoworker=0`). */
export async function buildTileGeo(terrain: Terrain, buildings: Building[], roads: AreaData['roads'], style: AreaStyle, roadMat: THREE.Material, bldMat: THREE.Material, farMat: THREE.Material, groundMat: THREE.Material, skip: Rect[]): Promise<TileGeo> {
  if (!USE_WORKER) {
    const r = buildRoads({ roads } as AreaData, terrain, roadMat);
    const rg = new THREE.Group() as THREE.Group & { surface: RoadSurface }; rg.name = 'roads'; rg.add(r); rg.surface = r.surface;
    return { roads: rg, blds: buildBuildings(buildings, terrain, bldMat, style), far: buildBuildingsFar(buildings, terrain, farMat), ground: buildTerrain(terrain, groundMat, style, skip), workerMs: 0 };
  }
  let seq = 0;
  const { nx, nz, cell, x0, z0, h, cover } = terrain;
  const tin = () => ({ nx, nz, cell, x0, z0, h: h.slice(), cover: cover.slice() }); // each job gets its own copy of the small height grid
  /** One job at a time: the next is only posted after the previous result came back. */
  const run = <K extends GeoResult['kind']>(job: Record<string, unknown>): Promise<Extract<GeoResult, { kind: K }>> => new Promise((ok, err) => {
    if (SKIP.includes(job.kind as string)) { const k = job.kind; ok((k === 'bld' ? { kind: k, chunks: [], count: 0 } : k === 'segs' ? { kind: k, segs: new Float32Array(0) } : k === 'ground' ? { kind: k, ground: { attrs: [], index: null, sphere: [0, 0, 0, 1], box: [0, 0, 0, 0, 0, 0] } } : { kind: k, geo: null }) as any); return; } // debug: ?skipgeo=roads,bld,far,ground,segs skips those worker jobs (RSS attribution, tools/perf/skipscan.mjs)
    const w = new Worker(new URL('./geo.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); if (e.data.error) err(new Error(e.data.error)); else ok(e.data); };
    w.onerror = (e) => { w.terminate(); err(new Error(e.message)); };
    w.postMessage({ ...job, seq: ++seq });
  });
  const t0 = performance.now();
  try {
    const rm = new THREE.Group() as THREE.Group & { surface: RoadSurface }; rm.name = 'roads';
    for (const c of roadChunkRects({ roads } as AreaData, terrain)) {
      const r = await run<'roads'>({ kind: 'roads', terrain: tin(), roads: c.roads, rect: c.rect, key: c.key });
      if (r.geo) { const m = new THREE.Mesh(geometryOf(r.geo), roadMat); m.name = `roads ${c.key}`; rm.add(m); }
    }
    rm.surface = roadSurfaceFrom((await run<'segs'>({ kind: 'segs', roads })).segs, terrain);
    // buildings: whole 600 m chunks, packed into jobs of ~BLD_JOB buildings (only that subset is cloned into the worker)
    const groups = new Map<string, Building[]>();
    for (const b of buildings) { const k = `${Math.floor(b.o[0] / 10 / CHUNK)},${Math.floor(b.o[1] / 10 / CHUNK)}`; const g = groups.get(k); if (g) g.push(b); else groups.set(k, [b]); }
    const group = new THREE.Group(); group.name = 'buildings'; let count = 0, pack: Building[] = [];
    const flush = async () => {
      if (!pack.length) return; const list = pack; pack = [];
      const r = await run<'bld'>({ kind: 'bld', terrain: tin(), buildings: list, style }); count += r.count;
      for (const [key, c] of r.chunks) { const m = new THREE.Mesh(geometryOf(c), bldMat); m.name = `bld ${key}`; m.castShadow = m.receiveShadow = false; group.add(m); }
    };
    for (const [k, list] of groups) { pack.push(...list); groups.delete(k); if (pack.length >= BLD_JOB) await flush(); }
    await flush();
    // far mesh: footprint, height and colours only (a slim copy of each building, not its facade/roof detail)
    const slim = buildings.filter((b) => b.m <= 2).map((b) => ({ r: [b.r[0] ?? []], h: b.h, wc: b.wc, rc: b.rc, m: b.m }));
    const fr = await run<'far'>({ kind: 'far', terrain: tin(), buildings: slim });
    const far = new THREE.Mesh(fr.geo ? geometryOf(fr.geo) : new THREE.BufferGeometry(), farMat); far.name = 'buildings-far';
    const gr = await run<'ground'>({ kind: 'ground', terrain: tin(), style, skip });
    const ground = new THREE.Mesh(unpackGeometry(gr.ground), groundMat); ground.name = 'terrain';
    return { roads: rm, blds: { group, count }, far, ground, workerMs: performance.now() - t0 };
  } finally { /* each job's worker terminates itself */ }
}
