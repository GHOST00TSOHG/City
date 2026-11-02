import * as THREE from 'three/webgpu';
import { registry, type Bounds, type AreaId } from './registry';
import { makeTerrain, type AreaBundle, type AreaData } from '../area/data';
import { buildTerrain, buildRoads } from '../area/ground';
import { styleFor } from '../area/textures';

/**
 * Link corridors: a short road + a strip of ground between two facing tile edges, so the NJ areas read as one place.
 *
 * The strip is its own little heightfield (4 m cells, ~360 m wide) whose first and last rows copy the two tile edges exactly
 * (sampled with the tiles' own heightAt, so the seam has no step), blended between them with a smoothstep, plus a gentle causeway
 * under the road so it never dips into the water. The road (class 1, 10 m) is draped on the strip with the same drape code as every
 * road, and a stub continues inside the far tile to its nearest road, draped on that tile's terrain: nothing floats.
 * Ring (farGround) triangles inside the strip are culled by the scene, and the sea plane shows through where the strip is below 0.
 */
export interface LinkDef {
  id: string;
  a: AreaId; /** local x (in a's frame, m) of the road end on a's south edge */ aX: number;
  b: AreaId; /** local x of the road on b's north edge */ bX: number;
  /** local z of the nearest major road end inside b (stub), or null when b's road already reaches its edge */ bStubZ: number | null;
  width?: number;
}
export const LINKS: LinkDef[] = [
  // Passaic's big south-edge road -> the Sandy Hook neck (1.2 km of causeway), then 1 km of stub to the Hartshorne road
  { id: 'nj-passaic-hook', a: 'passaic', aX: -1146, b: 'sandyhook', bX: -524, bStubZ: -1016 },
  // Sandy Hook's south end -> the Highlands shore (0.2 km)
  { id: 'nj-hook-highlands', a: 'sandyhook', aX: 1681, b: 'bayshore', bX: 398, bStubZ: null },
];

export interface Link {
  def: LinkDef; group: THREE.Group; rect: Bounds;
  /** road/ground top at a world point inside the strip, else null */ floorAt(x: number, z: number): number | null;
  /** road centre line (world), for tests and the minimap */ path: [number, number][];
  triangles: number; dispose(): void;
}

function mergeGeometries(gs: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  const total = (get: (g: THREE.BufferGeometry) => ArrayLike<number>) => gs.reduce((n, g) => n + get(g).length, 0);
  const cat = <T extends Float32Array | Int8Array | Uint8Array>(name: string, make: (n: number) => T) => {
    const arr = make(total((g) => g.getAttribute(name).array as unknown as ArrayLike<number>)); let o = 0;
    for (const g of gs) { const a = g.getAttribute(name).array as unknown as T; arr.set(a as any, o); o += a.length; }
    return arr;
  };
  out.setAttribute('position', new THREE.BufferAttribute(cat('position', (n) => new Float32Array(n)), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(cat('normal', (n) => new Int8Array(n)), 4, true));
  out.setAttribute('color', new THREE.BufferAttribute(cat('color', (n) => new Uint8Array(n)), 4, true));
  const idx = new Uint32Array(total((g) => g.index!.array)); let o = 0, v = 0;
  for (const g of gs) { const a = g.index!.array; for (let i = 0; i < a.length; i++) idx[o + i] = a[i] + v; o += a.length; v += g.getAttribute('position').count; }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

export function buildLink(def: LinkDef, A: AreaBundle, B: AreaBundle, groundMat: THREE.Material, roadMat: THREE.Material): Link {
  const ea = registry.get(def.a), eb = registry.get(def.b), ta = A.terrain, tb = B.terrain;
  const zA = ta.z0 + (ta.nz - 1) * ta.cell, zB = tb.z0; // a's south edge row, b's north edge row (world)
  const xa = def.aX + ea.worldOffset.x, xb = def.bX + eb.worldOffset.x, L = zB - zA, W = def.width ?? 360, hw = 5;
  if (L < 1) throw new Error(`link ${def.id}: tiles overlap or are out of order (gap ${L} m)`);
  const N = Math.max(2, Math.ceil(L / 4)), cell = L / N, M = Math.ceil(W / cell), nx = M + 1, nz = N + 1, xc = (xa + xb) / 2, x0 = xc - (M * cell) / 2;
  const h = new Float32Array(nx * nz), cover = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    const t = iz / N, s = t * t * (3 - 2 * t), xr = xa + (xb - xa) * t, amp = Math.sqrt(Math.sin(Math.PI * t));
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * cell, hA = ta.heightAt(x, zA), hB = tb.heightAt(x, zB);
      let v = hA + (hB - hA) * s;
      // the strip tapers from the full width at a's edge (which is land across the whole row) to the causeway: beyond `half` of the road it falls to the seabed
      const half = 14 + (W / 2 + 30 - 14) * (1 - Math.min(1, Math.max(0, t / 0.55)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, t / 0.55)))), k = Math.min(1, Math.max(0, (half + 28 - Math.abs(x - xr)) / 28)), g = k * k * (3 - 2 * k);
      v = -2.6 + (v + 2.6) * g;
      const wc = Math.max(0, 1 - Math.max(0, Math.abs(x - xr) - hw - 3) / 20); // causeway shoulder: road + 3 m flat, then 20 m down
      v += wc * amp * Math.max(0, 1.2 - v);
      h[iz * nx + ix] = iz === 0 ? hA : iz === N ? hB : v; // end rows are the tile edges exactly
    }
  }
  for (let i = 0; i < cover.length; i++) cover[i] = h[i] < 1 ? 2 : 1; // beach near the water, grass above
  const strip = makeTerrain({ nx, nz, cell, x0, z0: zA, h, cover });
  const group = new THREE.Group(); group.name = 'link:' + def.id;
  const ground = buildTerrain(strip, groundMat, styleFor(def.a)); ground.name = 'link-ground';
  const road = (pts: number[][], t: typeof strip, c = 1, w = 10) => buildRoads({ roads: [{ c, w, p: pts.flatMap(([x, z]) => [x * 10, z * 10]) }] } as unknown as AreaData, t, roadMat).geometry;
  const gapRoad = buildRoads({ roads: [{ c: 1, w: 10, p: [xa * 10, zA * 10, xb * 10, zB * 10] }] } as unknown as AreaData, strip, roadMat);
  const geos = [gapRoad.geometry];
  const path: [number, number][] = [[xa, zA], [xb, zB]];
  if (def.bStubZ !== null) { const zs = def.bStubZ + eb.worldOffset.z, xs = def.bX + eb.worldOffset.x; geos.push(road([[xb, zB], [xs, zs]], tb)); path.push([xs, zs]); }
  const roads = new THREE.Mesh(mergeGeometries(geos), roadMat); roads.name = 'link-road';
  geos.forEach((g) => g.dispose());
  group.add(ground, roads);
  const rect: Bounds = { minX: x0, maxX: x0 + M * cell, minZ: zA, maxZ: zB };
  return { def, group, rect, path, triangles: (nx - 1) * (nz - 1) * 2 + ((roads.geometry.index?.count ?? 0) / 3),
    floorAt(x, z) { return x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ ? null : Math.max(gapRoad.surface.surfaceAt(x, z), 0); },
    dispose() { group.traverse((o: any) => o.geometry?.dispose?.()); } };
}
