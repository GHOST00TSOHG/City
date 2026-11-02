import * as THREE from 'three/webgpu';
import type { Building, AreaData, Terrain } from './data';
import type { AreaStyle } from './textures';
import type { GeoJob, GeoResult } from './geo.worker';
import { applyCompact, type CompactGeo } from './geom';
import { buildBuildings, buildBuildingsFar } from './buildings';
import { buildRoads, roadSurfaceFrom, type RoadSurface } from './ground';

const USE_WORKER = typeof Worker !== 'undefined' && new URLSearchParams(location.search).get('geoworker') !== '0';
export interface TileGeo { roads: THREE.Mesh & { surface: RoadSurface }; blds: { group: THREE.Group; count: number }; far: THREE.Mesh; workerMs: number }

const geometryOf = (c: CompactGeo) => { const g = new THREE.BufferGeometry(); applyCompact(g, c); return g; };

/** Builds the roads, building chunks and far-detail buildings of one tile. In a short-lived worker when available (the main thread only wraps the
 *  returned buffers; the worker is terminated afterwards so its heap is released); inline otherwise (`?geoworker=0`). */
export async function buildTileGeo(terrain: Terrain, buildings: Building[], roads: AreaData['roads'], style: AreaStyle, roadMat: THREE.Material, bldMat: THREE.Material, farMat: THREE.Material): Promise<TileGeo> {
  if (!USE_WORKER) {
    const r = buildRoads({ roads } as AreaData, terrain, roadMat);
    return { roads: r, blds: buildBuildings(buildings, terrain, bldMat, style), far: buildBuildingsFar(buildings, terrain, farMat), workerMs: 0 };
  }
  const w = new Worker(new URL('./geo.worker.ts', import.meta.url), { type: 'module' });
  try {
    const res = await new Promise<GeoResult>((ok, err) => {
      w.onmessage = (e) => (e.data.error ? err(new Error(e.data.error)) : ok(e.data));
      w.onerror = (e) => err(new Error(e.message));
      const { nx, nz, cell, x0, z0, h, cover } = terrain;
      const job: GeoJob = { seq: 1, terrain: { nx, nz, cell, x0, z0, h, cover }, buildings, roads, style, far: true };
      w.postMessage(job);
    });
    const rm = new THREE.Mesh(geometryOf(res.roads), roadMat) as THREE.Mesh & { surface: RoadSurface }; rm.name = 'roads';
    rm.surface = roadSurfaceFrom(res.segs, terrain);
    const group = new THREE.Group(); group.name = 'buildings';
    for (const [key, c] of res.chunks) { const m = new THREE.Mesh(geometryOf(c), bldMat); m.name = `bld ${key}`; m.castShadow = m.receiveShadow = false; group.add(m); }
    const far = new THREE.Mesh(res.far ? geometryOf(res.far) : new THREE.BufferGeometry(), farMat); far.name = 'buildings-far';
    return { roads: rm, blds: { group, count: res.count }, far, workerMs: res.ms };
  } finally { w.terminate(); }
}
