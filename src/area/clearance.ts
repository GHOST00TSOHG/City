/** Shared spatial common-sense rules for everything we stand on the ground: lamps, trees, benches, pack buildings, vehicles.
 *  One index per area over every street segment (half width of the driving asphalt), every junction disc, every building footprint and the custom-town exclusion rects.
 *  Rules (Wave 3): nothing may sit within `hw + 0.25 m` of ANY road centreline (not just the one that spawned it), within `junction r + 0.4 m` of a junction disc,
 *  inside a building footprint, or inside a custom town's paved plaza. Street furniture sits on the outer sidewalk strip, `hw + 0.75 .. hw + 1.8 m` from the centreline. */
import type { AreaData } from './data';
import { ringPts } from './geom';
import { junctionSpots } from './ground';
import { isInTownExclusion } from './townDefs';

export const ROAD_MARGIN = 0.25, JUNCTION_MARGIN = 0.4, WALK_MIN = 0.75, WALK_MAX = 1.8;
const CELL = 16;

interface Seg { ax: number; az: number; bx: number; bz: number; hw: number; road: number }
interface Bld { ring: [number, number][]; minX: number; maxX: number; minZ: number; maxZ: number }
export interface RoadHit { gap: number; hw: number; px: number; pz: number }

const segDist = (x: number, z: number, s: Seg) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2)) : 0, px = s.ax + dx * t, pz = s.az + dz * t;
  return { d: Math.hypot(x - px, z - pz), px, pz };
};
const inRing = (x: number, z: number, ring: [number, number][]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};

export interface Clearance {
  areaId: string;
  /** nearest street asphalt edge: gap = distance to the centreline minus the half width (negative = inside the asphalt); null = no street within reach */
  nearestRoad(x: number, z: number, skipRoad?: number): RoadHit | null;
  /** distance to the nearest junction disc edge (negative = inside); Infinity when none is near */
  junctionGap(x: number, z: number): number;
  inBuilding(x: number, z: number): boolean;
  /** true when an object of `radius` metres at x,z breaks none of the rules above (and `extra` keeps it clear of roads by that much more) */
  ok(x: number, z: number, radius?: number, extra?: number): boolean;
  /** true when the object is on the outer sidewalk strip of some street (hw + 0.75 .. hw + 1.8 m from its centreline) */
  onStrip(x: number, z: number): boolean;
  segments: Seg[];
  junctions: { x: number; z: number; r: number }[];
}

export function buildClearance(areaId: string, area: Pick<AreaData, 'roads' | 'buildings'>): Clearance {
  const segs: Seg[] = [], grid = new Map<number, Seg[]>(), key = (i: number, j: number) => i * 100003 + j;
  const put = <T,>(g: Map<number, T[]>, x0: number, x1: number, z0: number, z1: number, v: T) => { for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = key(i, j); let l = g.get(k); if (!l) g.set(k, (l = [])); l.push(v); } };
  area.roads.forEach((r, ri) => {
    if (r.c > 2) return;
    const pts = ringPts(r.p), hw = r.w / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const s: Seg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], hw, road: ri }, e = hw + 8;
      segs.push(s); put(grid, Math.min(s.ax, s.bx) - e, Math.max(s.ax, s.bx) + e, Math.min(s.az, s.bz) - e, Math.max(s.az, s.bz) + e, s);
    }
  });
  const jn = junctionSpots(area.roads).centres, jgrid = new Map<number, typeof jn>();
  for (const j of jn) put(jgrid, j.x - j.r - 8, j.x + j.r + 8, j.z - j.r - 8, j.z + j.r + 8, j);
  const bgrid = new Map<number, Bld[]>();
  for (const b of area.buildings) {
    if (!b.r.length) continue;
    const ring = ringPts(b.r[0]); if (ring.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; for (const [x, z] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    put(bgrid, minX, maxX, minZ, maxZ, { ring, minX, maxX, minZ, maxZ });
  }
  const nearestRoad = (x: number, z: number, skipRoad = -1): RoadHit | null => {
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return null;
    let best: RoadHit | null = null;
    for (const s of l) { if (s.road === skipRoad) continue; const { d, px, pz } = segDist(x, z, s), gap = d - s.hw; if (!best || gap < best.gap) best = { gap, hw: s.hw, px, pz }; }
    return best;
  };
  const junctionGap = (x: number, z: number) => { const l = jgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); let g = Infinity; if (l) for (const j of l) g = Math.min(g, Math.hypot(x - j.x, z - j.z) - j.r); return g; };
  const inBuilding = (x: number, z: number) => { const l = bgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (l) for (const b of l) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && inRing(x, z, b.ring)) return true; return false; };
  const ok = (x: number, z: number, radius = 0.4, extra = 0) => {
    const r = nearestRoad(x, z); if (r && r.gap < ROAD_MARGIN + radius + extra) return false;
    if (junctionGap(x, z) < JUNCTION_MARGIN + radius + extra) return false;
    if (inBuilding(x, z)) return false;
    if (isInTownExclusion(areaId, x, z, radius + extra)) return false;
    return true;
  };
  const onStrip = (x: number, z: number) => { const r = nearestRoad(x, z); return !!r && r.gap >= WALK_MIN && r.gap <= WALK_MAX + 0.05; };
  return { areaId, nearestRoad, junctionGap, inBuilding, ok, onStrip, segments: segs, junctions: jn };
}

/** Lamps ([x dm, z dm, inferred, arm heading mrad]) that obey the rules; those within 6 m of a street are re-aimed so the arm reaches over the asphalt, and pushed out onto the outer strip when too close to the kerb. */
export function placeLamps(lamps: number[][], ck: Clearance): number[][] {
  const out: number[][] = [];
  for (const l of lamps) {
    let x = l[0] / 10, z = l[1] / 10, a = (l[3] ?? 0) / 1000;
    const r = ck.nearestRoad(x, z);
    if (r && r.gap < 6) {
      const dx = r.px - x, dz = r.pz - z, d = Math.hypot(dx, dz) || 1;
      if (r.gap < WALK_MIN) { const push = WALK_MIN + 0.1 - r.gap; x -= (dx / d) * push; z -= (dz / d) * push; } // too close to the kerb: step back onto the strip
      a = Math.atan2(dz, dx); // arm toward the street
    }
    if (!ck.ok(x, z, 0.3)) continue;
    out.push([Math.round(x * 10), Math.round(z * 10), l[2] ?? 0, Math.round(a * 1000)]);
  }
  return out;
}

/** Trees (flat stride 5: x dm, z dm, kind, height dm, seed) keeping only those whose trunk obeys the rules. */
export function placeTrees(flat: number[], ck: Clearance): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 < flat.length; i += 5) if (ck.ok(flat[i] / 10, flat[i + 1] / 10, 0.6)) out.push(flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4]);
  return out;
}
