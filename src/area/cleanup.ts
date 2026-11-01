/** World clean-up + audit model. PURE (type-only imports) so tools/world/audit.mjs can run the exact same code under plain node.
 *  cleanArea() fixes a baked area at load time (nothing per object): drops/levels buildings, builds ground under roads, plans bridges,
 *  seawalls and beaches, culls props in water. auditWorld() measures any world state (before = raw bake, after = cleaned). */
import type { AreaData, Building, Terrain } from './data';

export type P = [number, number];
export const ringOf = (r: number[]) => { const o: P[] = []; for (let i = 0; i + 1 < r.length; i += 2) o.push([r[i] / 10, r[i + 1] / 10]); return o; };
export function inPoly(x: number, z: number, p: P[]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
export function distToSeg(x: number, z: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2));
  return Math.hypot(x0 + dx * u - x, z0 + dz * u - z);
}
const smooth = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// ---- thresholds (shared by fix and audit) ----
export const T = {
  WATER_FRAC: 0.35,      // building: share of footprint samples under water that counts as "in water"
  FILL_FRAC: 0.02,       // below WATER_FRAC but above this: the wet corner is filled with ground
  FLOAT_GAP: 0.1,        // wall bottom above the lowest ground sample (m)
  SUNK_DEPTH: 0.5,       // highest ground sample above the building floor (m)
  OVERLAP_FRAC: 0.3,     // share of the smaller building inside another
  ROAD_FRAC: 0.2,        // share of footprint inside a road ribbon
  WET: -0.2,             // terrain below this is open water for road purposes
  PIER_SPACING: 14,      // max distance from any bridge point to a pier bent (m)
  BANK: 1.0,             // shore edge whose land side is at least this high needs a seawall (m)
  POOL_SPREAD: 0.4,      // pools: ground spread under the rim (m)
  PAD_TOL: 2.0,
};

export interface BInfo { i: number; b: Building; outer: P[]; s: number[]; bb: [number, number, number, number]; area: number }
function samples(outer: P[]) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0;
  for (let i = 0; i < outer.length; i++) { const p = outer[i], q = outer[(i + 1) % outer.length]; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); a += p[0] * q[1] - q[0] * p[1]; }
  a = Math.abs(a) / 2;
  const s: number[] = []; for (const p of outer) s.push(p[0], p[1]);
  const cx = outer.reduce((q, p) => q + p[0], 0) / outer.length, cz = outer.reduce((q, p) => q + p[1], 0) / outer.length;
  if (inPoly(cx, cz, outer)) s.push(cx, cz);
  const step = Math.max(2, Math.sqrt(a / 90));
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (inPoly(x, z, outer)) s.push(x, z);
  return { s, bb: [x0, z0, x1, z1] as [number, number, number, number], area: a };
}
export function binfo(list: Building[]): BInfo[] {
  const out: BInfo[] = [];
  list.forEach((b, i) => { const outer = ringOf(b.r[0] ?? []); if (outer.length < 3) return; const { s, bb, area } = samples(outer); out.push({ i, b, outer, s, bb, area }); });
  return out;
}

// ---- spatial hashes ----
class Grid {
  m = new Map<number, number[]>(); B: number; constructor(B: number) { this.B = B; }
  add(id: number, x0: number, z0: number, x1: number, z1: number) { for (let i = Math.floor(x0 / this.B); i <= Math.floor(x1 / this.B); i++) for (let j = Math.floor(z0 / this.B); j <= Math.floor(z1 / this.B); j++) { const k = i * 100003 + j; let l = this.m.get(k); if (!l) this.m.set(k, (l = [])); l.push(id); } }
  at(x: number, z: number) { return this.m.get(Math.floor(x / this.B) * 100003 + Math.floor(z / this.B)); }
  near(x0: number, z0: number, x1: number, z1: number) { const s = new Set<number>(); for (let i = Math.floor(x0 / this.B); i <= Math.floor(x1 / this.B); i++) for (let j = Math.floor(z0 / this.B); j <= Math.floor(z1 / this.B); j++) { const l = this.m.get(i * 100003 + j); if (l) for (const v of l) s.add(v); } return s; }
}
export interface RoadIndex { inside(x: number, z: number, shrink?: number): boolean; near(x: number, z: number, r: number): boolean }
/** Index of drivable ribbons (class <= 2, width >= 4): is a point inside / within r of one? */
export function roadIndex(roads: AreaData['roads']): RoadIndex {
  const g = new Grid(32), segs: number[] = [];
  for (const r of roads) {
    if (r.c > 2 || r.w < 4) continue; const p = ringOf(r.p), hw = r.w / 2;
    for (let i = 0; i + 1 < p.length; i++) { const id = segs.length / 5; segs.push(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], hw); g.add(id, Math.min(p[i][0], p[i + 1][0]) - hw - 8, Math.min(p[i][1], p[i + 1][1]) - hw - 8, Math.max(p[i][0], p[i + 1][0]) + hw + 8, Math.max(p[i][1], p[i + 1][1]) + hw + 8); }
  }
  const test = (x: number, z: number, extra: number, shrink: number) => { const l = g.at(x, z); if (l) for (const id of l) { const o = id * 5; if (distToSeg(x, z, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]) <= segs[o + 4] * shrink + extra) return true; } return false; };
  return { inside: (x, z, shrink = 1) => test(x, z, 0, shrink), near: (x, z, r) => test(x, z, r, 1) };
}

// ---- terrain helpers ----
const idx = (t: Terrain, ix: number, iz: number) => iz * t.nx + ix;
/** Vertices (ix, iz) whose position is within `margin` of polygon `pts`. */
function vertsNear(t: Terrain, pts: P[], margin: number, fn: (i: number, d: number) => void) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const ax = Math.max(0, Math.floor((x0 - margin - t.x0) / t.cell)), bx = Math.min(t.nx - 1, Math.ceil((x1 + margin - t.x0) / t.cell));
  const az = Math.max(0, Math.floor((z0 - margin - t.z0) / t.cell)), bz = Math.min(t.nz - 1, Math.ceil((z1 + margin - t.z0) / t.cell));
  for (let iz = az; iz <= bz; iz++) for (let ix = ax; ix <= bx; ix++) {
    const x = t.x0 + ix * t.cell, z = t.z0 + iz * t.cell;
    if (inPoly(x, z, pts)) { fn(idx(t, ix, iz), 0); continue; }
    let d = Infinity; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; d = Math.min(d, distToSeg(x, z, p[0], p[1], q[0], q[1])); }
    if (d <= margin) fn(idx(t, ix, iz), d);
  }
}

// ---- roads ----
export interface Span { i0: number; i1: number; kind: 'bridge' | 'causeway'; deckY: number }
export interface RoadPlan { pts: P[]; /** absolute centre-line y where a bridge/ramp overrides the terrain, else NaN */ y: number[] | null; spans: Span[]; wet: number }
export interface Bridge { road: number; i0: number; i1: number; deckY: number; hw: number; len: number; bents: [number, number, number][] }
export function resample(pts: P[], step: number) {
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step); for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
    out.push(pts[i]);
  }
  return out;
}
export function wetRuns(pts: P[], t: Terrain) {
  const runs: [number, number][] = []; let a = -1;
  for (let i = 0; i < pts.length; i++) {
    const w = t.heightAt(pts[i][0], pts[i][1]) < T.WET;
    if (w && a < 0) a = i; if (!w && a >= 0) { runs.push([a, i - 1]); a = -1; }
  }
  if (a >= 0) runs.push([a, pts.length - 1]);
  return runs;
}
const groundY = (t: Terrain, x: number, z: number) => Math.max(t.heightAt(x, z), 0.05);
const LIFT = [0.16, 0.13, 0.1, 0.07];
export function planRoads(roads: AreaData['roads'], t: Terrain, fix: boolean) {
  const step = Math.max(2, t.cell), plans: RoadPlan[] = [], bridges: Bridge[] = [];
  const stats = { causeways: 0, bridges: 0, filledVerts: 0, bridgeLen: 0, pierBents: 0 };
  roads.forEach((r, ri) => {
    const pts = resample(ringOf(r.p), step), plan: RoadPlan = { pts, y: null, spans: [], wet: 0 };
    plans.push(plan); if (pts.length < 2) return;
    const runs = wetRuns(pts, t); plan.wet = runs.length; if (!fix || !runs.length) return;
    const hw = r.w / 2, lift = LIFT[r.c] ?? 0.1;
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (const [a, b] of runs) {
      const i0 = Math.max(0, a - 1), i1 = Math.min(pts.length - 1, b + 1), len = cum[i1] - cum[i0];
      let depth = 0; for (let i = a; i <= b; i++) depth = Math.max(depth, -t.heightAt(pts[i][0], pts[i][1]));
      if (len <= 48 && depth <= 1.8) { // causeway: build embankment ground under the road, grass shoulders
        const seg = pts.slice(i0, i1 + 1), R = hw + t.cell * 0.8; let n = 0;
        vertsNear(t, seg.length > 1 ? seg.concat(seg.slice(0, -1).reverse()) : seg, R, (vi, d) => {
          const x = t.x0 + (vi % t.nx) * t.cell, z = t.z0 + Math.floor(vi / t.nx) * t.cell; void x; void z;
          const k = d <= hw + 1.5 ? 1 : 1 - smooth((d - hw - 1.5) / Math.max(R - hw - 1.5, 0.1));
          const target = 0.35 * k; if (t.h[vi] < target) { t.h[vi] = target; n++; }
          t.cover[vi] = d <= hw + t.cell * 0.4 ? 3 : 1;
        });
        plan.spans.push({ i0, i1, kind: 'causeway', deckY: 0.35 }); stats.causeways++; stats.filledVerts += n;
        continue;
      }
      // bridge: deck above the water, ramps on the land sides, pier bents down to the seabed
      const road = r.c <= 1;
      const aY = groundY(t, pts[i0][0], pts[i0][1]) + lift, bY = groundY(t, pts[i1][0], pts[i1][1]) + lift;
      const deckY = Math.max(road ? 1.7 : 1.15, aY + 0.15, bY + 0.15), RAMP = road ? 22 : 10;
      if (!plan.y) plan.y = new Array(pts.length).fill(NaN);
      for (let i = 0; i < pts.length; i++) {
        let y = NaN;
        if (i >= i0 && i <= i1) y = deckY;
        else if (i < i0 && cum[i0] - cum[i] < RAMP) y = aY + (deckY - aY) * smooth(1 - (cum[i0] - cum[i]) / RAMP);
        else if (i > i1 && cum[i] - cum[i1] < RAMP) y = bY + (deckY - bY) * smooth(1 - (cum[i] - cum[i1]) / RAMP);
        if (!Number.isNaN(y)) plan.y[i] = Number.isNaN(plan.y[i]) ? y : Math.max(plan.y[i], y);
      }
      const bents: [number, number, number][] = [], spacing = 10, nb = Math.max(2, Math.ceil(len / spacing) + 1);
      for (let k = 0; k < nb; k++) {
        const s = cum[i0] + (len * k) / (nb - 1); let i = i0; while (i < i1 - 1 && cum[i + 1] < s) i++;
        const u = (s - cum[i]) / Math.max(cum[i + 1] - cum[i], 1e-6), x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
        bents.push([x, z, Math.min(t.heightAt(x, z), 0)]);
      }
      plan.spans.push({ i0, i1, kind: 'bridge', deckY });
      bridges.push({ road: ri, i0, i1, deckY, hw, len, bents }); stats.bridges++; stats.bridgeLen += len; stats.pierBents += nb;
    }
  });
  return { plans, bridges, stats };
}

// ---- shoreline ----
export interface ShoreSeg { x0: number; z0: number; x1: number; z1: number; land: number; nx: number; nz: number }
/** Marching squares on the 0 m contour. nx,nz = unit normal pointing toward the land side. */
export function shoreSegments(t: Terrain): ShoreSeg[] {
  const out: ShoreSeg[] = [], { nx, nz, cell, x0, z0, h } = t;
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const i = iz * nx + ix, c = [h[i], h[i + 1], h[i + nx + 1], h[i + nx]], px = [0, 1, 1, 0], pz = [0, 0, 1, 1];
    const wet = c.map((v) => v < 0); if (wet.every((w) => w) || wet.every((w) => !w)) continue;
    const pts: [number, number][] = [];
    for (let e = 0; e < 4; e++) { const a = e, b = (e + 1) % 4; if (wet[a] !== wet[b]) { const u = c[a] / (c[a] - c[b]); pts.push([x0 + (ix + px[a] + (px[b] - px[a]) * u) * cell, z0 + (iz + pz[a] + (pz[b] - pz[a]) * u) * cell]); } }
    const land = Math.max(...c.map((v, k) => (wet[k] ? -Infinity : v)));
    let lx = 0, lz = 0, n = 0; c.forEach((v, k) => { if (!wet[k]) { lx += x0 + (ix + px[k]) * cell; lz += z0 + (iz + pz[k]) * cell; n++; } });
    lx /= n; lz /= n;
    for (let k = 0; k + 1 < pts.length; k += 2) {
      const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue;
      let nxx = -dz / L, nzz = dx / L; if (nxx * (lx - a[0]) + nzz * (lz - a[1]) < 0) { nxx = -nxx; nzz = -nzz; }
      out.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], land, nx: nxx, nz: nzz });
    }
  }
  return out;
}
export const needsWall = (s: ShoreSeg, ri: RoadIndex) => s.land >= T.BANK || ri.near((s.x0 + s.x1) / 2 + s.nx * 3, (s.z0 + s.z1) / 2 + s.nz * 3, 5);

// ---- the cleaner ----
export interface CleanResult {
  area: AreaData; plans: RoadPlan[]; bridges: Bridge[]; walls: ShoreSeg[];
  stats: Record<string, number>;
}
const done = new WeakMap<object, CleanResult>();
/** Idempotent per area object. Mutates terrain (levels pads, builds ground under roads, beaches) and returns a cleaned shallow copy of the area. */
export function cleanArea(area: AreaData, t: Terrain): CleanResult {
  const hit = done.get(area); if (hit) return hit;
  const st: Record<string, number> = {};
  const bump = (k: string, n = 1) => { st[k] = (st[k] ?? 0) + n; };
  const water = (x: number, z: number) => t.heightAt(x, z) < 0;

  // 1) ground under roads, bridges (before buildings are judged against the final shore)
  const rp = planRoads(area.roads, t, true);
  Object.assign(st, { causewaysBuilt: rp.stats.causeways, bridgesBuilt: rp.stats.bridges, bridgeMetres: Math.round(rp.stats.bridgeLen), pierBents: rp.stats.pierBents, causewayVerts: rp.stats.filledVerts });

  // 2) buildings: in water -> remove (or fill a wet corner), road / building overlap -> remove, then snap to ground
  const infos = binfo(area.buildings), ri = roadIndex(area.roads), drop = new Set<number>();
  const tiny = (q: BInfo) => q.b.m > 0; // elevated parts float on purpose
  for (const q of infos) {
    if (tiny(q)) continue;
    let w = 0, n = 0; for (let k = 0; k < q.s.length; k += 2) { n++; if (water(q.s[k], q.s[k + 1])) w++; }
    const f = w / n;
    if (f >= T.WATER_FRAC) { drop.add(q.i); bump('buildingsRemovedInWater'); continue; }
    if (f > T.FILL_FRAC) { vertsNear(t, q.outer, 2, (vi) => { if (t.h[vi] < 0.3) { t.h[vi] = 0.3; t.cover[vi] = 2; } }); bump('buildingsShoreFilled'); }
  }
  for (const q of infos) {
    if (drop.has(q.i) || tiny(q)) continue;
    let r = 0, n = 0; for (let k = 0; k < q.s.length; k += 2) { n++; if (ri.inside(q.s[k], q.s[k + 1])) r++; }
    if (r / n >= T.ROAD_FRAC) { drop.add(q.i); bump('buildingsRemovedOnRoad'); }
  }
  const g = new Grid(40); const live = infos.filter((q) => !drop.has(q.i) && !tiny(q)); const byId = new Map<number, BInfo>();
  for (const q of live) { byId.set(q.i, q); g.add(q.i, q.bb[0], q.bb[1], q.bb[2], q.bb[3]); }
  for (const q of live.slice().sort((a, b) => a.area - b.area)) { // smallest first: it is the one removed
    if (drop.has(q.i)) continue;
    for (const j of g.near(q.bb[0], q.bb[1], q.bb[2], q.bb[3])) {
      if (j === q.i || drop.has(j)) continue; const o = byId.get(j)!;
      if (o.area < q.area || (o.area === q.area && o.i < q.i)) continue; // only judge against bigger (or earlier equal) buildings
      if (o.bb[0] > q.bb[2] || o.bb[2] < q.bb[0] || o.bb[1] > q.bb[3] || o.bb[3] < q.bb[1]) continue;
      let c = 0, n = 0; for (let k = 0; k < q.s.length; k += 2) { n++; if (inPoly(q.s[k], q.s[k + 1], o.outer)) c++; }
      if (c / n >= T.OVERLAP_FRAC) { drop.add(q.i); bump('buildingsRemovedOverlap'); break; }
    }
  }
  const buildings: Building[] = [];
  for (const q of infos) {
    if (drop.has(q.i)) continue;
    if (tiny(q)) { buildings.push(q.b); continue; }
    // snap to ground: floor at the 35th percentile of the ground under the footprint, terrain levelled to it, foundation reaches the lowest sample
    const hs: number[] = []; for (let k = 0; k < q.s.length; k += 2) hs.push(Math.max(t.heightAt(q.s[k], q.s[k + 1]), 0));
    hs.sort((a, b) => a - b);
    const pad = Math.max(hs[Math.floor(hs.length * 0.35)], 0.2);
    vertsNear(t, q.outer, 1, (vi) => { if (Math.abs(t.h[vi] - pad) < T.PAD_TOL && t.h[vi] > 0) t.h[vi] = pad; });
    let lo = Infinity; for (let k = 0; k < q.s.length; k += 2) lo = Math.min(lo, Math.max(t.heightAt(q.s[k], q.s[k + 1]), 0));
    buildings.push({ ...q.b, pad, fy: Math.min(lo, pad) - 0.3 });
    bump('buildingsSnapped');
  }
  st.buildingsKept = buildings.length; st.buildingsRemoved = area.buildings.length - buildings.length;

  // 3) pools sit on a level pad
  for (const p of area.pools) {
    const pts = ringOf(p); if (pts.length < 3) continue; let lo = Infinity; for (const [x, z] of pts) lo = Math.min(lo, t.heightAt(x, z));
    const y = Math.max(lo, 0.2); vertsNear(t, pts, 1.5, (vi) => { if (t.h[vi] > y - 0.01 && t.h[vi] < y + 1.5) t.h[vi] = y; }); bump('poolsLevelled');
  }

  // 4) props: no trees or lamps in water, inside buildings or on a road core
  const bg = new Grid(32), bl = buildings.map((b) => ringOf(b.r[0] ?? []));
  bl.forEach((o, k) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of o) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } bg.add(k, x0, z0, x1, z1); });
  const onBuilding = (x: number, z: number) => { const l = bg.at(x, z); if (l) for (const k of l) if (inPoly(x, z, bl[k])) return true; return false; };
  const trees: number[] = [];
  for (let i = 0; i + 4 < area.trees.length; i += 5) {
    const x = area.trees[i] / 10, z = area.trees[i + 1] / 10;
    if (water(x, z)) { bump('treesRemovedWater'); continue; }
    if (onBuilding(x, z)) { bump('treesRemovedBuilding'); continue; }
    if (ri.inside(x, z, 0.8)) { bump('treesRemovedRoad'); continue; }
    for (let k = 0; k < 5; k++) trees.push(area.trees[i + k]);
  }
  const lamps = area.lamps.filter((l) => { const x = l[0] / 10, z = l[1] / 10; if (water(x, z)) { bump('lampsRemovedWater'); return false; } if (onBuilding(x, z)) { bump('lampsRemovedBuilding'); return false; } return true; });

  // 5) shorelines: seawalls on banks and built-up shore, sand beach elsewhere
  const walls: ShoreSeg[] = [], segs = shoreSegments(t);
  for (const s of segs) if (needsWall(s, ri)) walls.push(s);
  let beach = 0;
  for (let iz = 1; iz < t.nz - 1; iz++) for (let ix = 1; ix < t.nx - 1; ix++) {
    const i = idx(t, ix, iz); if (t.h[i] < 0 || t.h[i] >= 0.6 || t.cover[i] === 3) continue;
    if (t.h[i - 1] < 0 || t.h[i + 1] < 0 || t.h[i - t.nx] < 0 || t.h[i + t.nx] < 0) { t.cover[i] = 2; beach++; }
  }
  Object.assign(st, { seawallSegments: walls.length, seawallMetres: Math.round(walls.reduce((q, s) => q + Math.hypot(s.x1 - s.x0, s.z1 - s.z0), 0)), beachVerts: beach });
  const out: CleanResult = { area: { ...area, buildings, trees, lamps }, plans: rp.plans, bridges: rp.bridges, walls, stats: st };
  done.set(area, out); return out;
}

// ---- audit ----
export interface WorldView {
  area: AreaData; terrain: Terrain;
  plans?: RoadPlan[]; bridges?: Bridge[]; walls?: ShoreSeg[];
  /** dock plan (see dockPlan.ts): per pier supports; null = raw bake (decks only) */
  docks?: { piers: { over: number; pilings: number }[] } | null;
}
export const ISSUES = ['buildingInWater', 'buildingFloating', 'buildingSunk', 'buildingOverlap', 'buildingOnRoad', 'roadFloating', 'bridgeUnsupported', 'treeBadlyPlaced', 'propBadlyPlaced', 'shorelineGap', 'nonFlatWater', 'pierUnsupported'] as const;
export type Issue = (typeof ISSUES)[number];
export function auditWorld(w: WorldView): { counts: Record<Issue, number>; totals: Record<string, number>; examples: Record<string, unknown[]> } {
  const { area, terrain: t } = w, counts = Object.fromEntries(ISSUES.map((k) => [k, 0])) as Record<Issue, number>, ex: Record<string, unknown[]> = {};
  const note = (k: Issue, v: unknown) => { counts[k]++; (ex[k] ??= []).length < 5 && ex[k].push(v); };
  const infos = binfo(area.buildings), ri = roadIndex(area.roads), real = infos.filter((q) => q.b.m <= 0);
  // buildings
  const g = new Grid(40); for (const q of real) g.add(q.i, q.bb[0], q.bb[1], q.bb[2], q.bb[3]);
  const byId = new Map(real.map((q) => [q.i, q] as const));
  for (const q of real) {
    const hs: number[] = []; let wet = 0, onRoad = 0, n = 0;
    for (let k = 0; k < q.s.length; k += 2) { const h = t.heightAt(q.s[k], q.s[k + 1]); n++; if (h < 0) wet++; else hs.push(h); if (ri.inside(q.s[k], q.s[k + 1])) onRoad++; }
    const id = { x: Math.round(q.outer[0][0]), z: Math.round(q.outer[0][1]) };
    if (wet / n >= T.WATER_FRAC) { note('buildingInWater', id); continue; }
    let rmin = Infinity; for (const p of q.outer) rmin = Math.min(rmin, t.heightAt(p[0], p[1]));
    const floorRef = q.b.pad ?? Math.max(rmin, 0.2), bottom = q.b.fy ?? floorRef - 0.4;
    if (hs.length) {
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (bottom - lo > T.FLOAT_GAP) note('buildingFloating', { ...id, gap: +(bottom - lo).toFixed(2) });
      if (hi - floorRef > T.SUNK_DEPTH) note('buildingSunk', { ...id, depth: +(hi - floorRef).toFixed(2) });
    }
    if (onRoad / n >= T.ROAD_FRAC) note('buildingOnRoad', id);
    for (const j of g.near(q.bb[0], q.bb[1], q.bb[2], q.bb[3])) {
      if (j === q.i) continue; const o = byId.get(j)!; if (o.area < q.area || (o.area === q.area && o.i < q.i)) continue;
      if (o.bb[0] > q.bb[2] || o.bb[2] < q.bb[0] || o.bb[1] > q.bb[3] || o.bb[3] < q.bb[1]) continue;
      let c = 0, m = 0; for (let k = 0; k < q.s.length; k += 2) { m++; if (inPoly(q.s[k], q.s[k + 1], o.outer)) c++; }
      if (c / m >= T.OVERLAP_FRAC) { note('buildingOverlap', id); break; }
    }
  }
  // roads: wet runs not carried by a bridge, and bridges without enough piers
  const plans = w.plans ?? area.roads.map((r) => ({ pts: resample(ringOf(r.p), Math.max(2, t.cell)), y: null, spans: [], wet: 0 }) as RoadPlan);
  plans.forEach((p, ri2) => {
    for (const [a, b] of wetRuns(p.pts, t)) {
      let carried = true; for (let i = a; i <= b; i++) if (!p.y || Number.isNaN(p.y[i])) carried = false;
      if (!carried) note('roadFloating', { road: ri2, x: Math.round(p.pts[a][0]), z: Math.round(p.pts[a][1]), run: b - a + 1 });
    }
  });
  const bridged = new Set((w.bridges ?? []).map((b) => b.road));
  for (const b of w.bridges ?? []) {
    const p = plans[b.road]; let bad = false;
    for (let i = b.i0; i <= b.i1 && !bad; i++) { let near = false; for (const e of b.bents) if (Math.hypot(e[0] - p.pts[i][0], e[1] - p.pts[i][1]) <= T.PIER_SPACING) { near = true; break; } if (!near) bad = true; }
    if (bad || b.bents.length < 2) note('bridgeUnsupported', { road: b.road, len: Math.round(b.len) });
  }
  void bridged;
  // trees / props
  const bl = new Grid(32), polys = real.map((q) => q.outer); real.forEach((q, k) => bl.add(k, q.bb[0], q.bb[1], q.bb[2], q.bb[3]));
  const onB = (x: number, z: number) => { const l = bl.at(x, z); if (l) for (const k of l) if (inPoly(x, z, polys[k])) return true; return false; };
  for (let i = 0; i + 4 < area.trees.length; i += 5) {
    const x = area.trees[i] / 10, z = area.trees[i + 1] / 10;
    if (t.heightAt(x, z) < 0 || onB(x, z) || ri.inside(x, z, 0.8)) note('treeBadlyPlaced', { x: Math.round(x), z: Math.round(z) });
  }
  for (const l of area.lamps) { const x = l[0] / 10, z = l[1] / 10; if (t.heightAt(x, z) < 0 || onB(x, z)) note('propBadlyPlaced', { x: Math.round(x), z: Math.round(z) }); }
  // shoreline
  const walls = w.walls ?? [], have = new Set(walls.map((s) => `${s.x0.toFixed(2)},${s.z0.toFixed(2)}`));
  const segs = shoreSegments(t);
  for (const s of segs) if (needsWall(s, ri) && !have.has(`${s.x0.toFixed(2)},${s.z0.toFixed(2)}`)) note('shorelineGap', { x: Math.round(s.x0), z: Math.round(s.z0), bank: +s.land.toFixed(2) });
  // water: pools must sit on level ground
  for (const p of area.pools) {
    const pts = ringOf(p); if (pts.length < 3) continue; let lo = Infinity, hi = -Infinity;
    for (const [x, z] of pts) { const h = t.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - Math.max(lo, 0.2) > T.POOL_SPREAD) note('nonFlatWater', { x: Math.round(pts[0][0]), z: Math.round(pts[0][1]), spread: +(hi - lo).toFixed(2) });
  }
  // piers over water need pilings
  area.piers.forEach((p, k) => {
    const d = w.docks?.piers[k]; if (!d) { if (!w.docks) { const pts = ringOf(p.poly ?? p.line ?? []); if (pts.some(([x, z]) => t.heightAt(x, z) < 0)) note('pierUnsupported', { pier: k }); } return; }
    if (d.over > 0 && d.pilings < Math.max(2, d.over * 0.2)) note('pierUnsupported', { pier: k });
  });
  const totals = { buildings: area.buildings.length, roads: area.roads.length, trees: area.trees.length / 5, lamps: area.lamps.length, pools: area.pools.length, piers: area.piers.length, bridges: (w.bridges ?? []).length, seawallSegments: walls.length, shoreSegments: segs.length };
  return { counts, totals, examples: ex };
}
