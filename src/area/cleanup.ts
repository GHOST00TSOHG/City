/** World clean-up + audit model. PURE (type-only imports) so tools/world/audit.mjs can run the exact same code under plain node.
 *  cleanArea() fixes a baked area at load time (nothing per object): drops/levels buildings, builds ground under roads, plans bridges,
 *  seawalls and beaches, culls props in water. auditWorld() measures any world state (before = raw bake, after = cleaned). */
import type { AreaData, Building, Terrain } from './data';
import type { DockPlan } from './dockPlan';

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
  OVER_SPACING: 22,      // same for overpasses (a bent cannot stand on the road underneath)
  OVER_CLEAR: 5.2,       // deck soffit clearance over a crossing road (m, deck top minus crossing surface)
  OVER_FREE: 3.0,        // deck height over open ground when nothing crossing is modelled (rail, creek)
  UNDER_MIN: 1.8,        // open height under a bridge/overpass at its highest point (soffit above ground/water, m)
  BANK: 1.0,             // shore edge whose land side is at least this high needs a seawall (m)
  POOL_SPREAD: 0.4,      // pools: ground spread under the rim (m)
  PAD_TOL: 2.0,
  GRADE_SLOPE: 0.2,     // steep-lot grading: fill apron falls away from the wall at this rise/run (1:5, a gentle lawn bank: steeper banks raised neighbours too)
  GRADE_REACH: 14,       // ... and reaches at most this far from the wall (m)
  GRADE_LIP: 0.35,       // fill meets the wall this far under the floor, so a low stone plinth shows
  EXPOSED: 1.2,          // bare foundation wall taller than this (floor minus ground at the wall, m) counts as exposed
};

/** Tallest bare wall between the ground and the floor along the footprint outline (m). Samples the outline every ~1.5 m. */
export function exposedHeight(outer: P[], floor: number, heightAt: (x: number, z: number) => number): number {
  let worst = 0;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.5));
    for (let k = 0; k <= n; k++) { const u = k / n; worst = Math.max(worst, floor - Math.max(heightAt(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u), 0)); }
  }
  return worst;
}

/** Distance from a point to a polygon outline. */
export function ringDist(x: number, z: number, pts: P[]) { let d = Infinity; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; d = Math.min(d, distToSeg(x, z, p[0], p[1], q[0], q[1])); } return d; }

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
export interface Span { i0: number; i1: number; kind: 'bridge' | 'causeway' | 'overpass'; deckY: number }
export interface RoadPlan { pts: P[]; /** absolute centre-line y where a bridge/ramp overrides the terrain, else NaN */ y: number[] | null; spans: Span[]; wet: number }
export interface Bridge { kind: 'water' | 'overpass'; road: number; i0: number; i1: number; deckY: number; hw: number; len: number; bents: [number, number, number][] }
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
/** Keeps road pieces inside the baked terrain grid (a road outside it has no ground at all). */
export function clipRoads(roads: AreaData['roads'], t: Terrain) {
  const x1 = t.x0 + (t.nx - 1) * t.cell, z1 = t.z0 + (t.nz - 1) * t.cell, out: AreaData['roads'] = [];
  for (const r of roads) {
    let cur: number[] = [];
    const flush = () => { if (cur.length >= 4) out.push({ ...r, p: cur }); cur = []; };
    for (let i = 0; i + 1 < r.p.length; i += 2) { const x = r.p[i] / 10, z = r.p[i + 1] / 10; if (x < t.x0 || x > x1 || z < t.z0 || z > z1) flush(); else cur.push(r.p[i], r.p[i + 1]); }
    flush();
  }
  return out;
}
const groundY = (t: Terrain, x: number, z: number) => Math.max(t.heightAt(x, z), 0.05);
export const LIFT = [0.16, 0.13, 0.1, 0.07];
export function planRoads(roads: AreaData['roads'], t: Terrain, fix: boolean, legacy = false) {
  const step = Math.max(2, t.cell), plans: RoadPlan[] = [], bridges: Bridge[] = [];
  const stats: { causeways: number; bridges: number; filledVerts: number; bridgeLen: number; pierBents: number; overpasses: number } = { causeways: 0, bridges: 0, filledVerts: 0, bridgeLen: 0, pierBents: 0, overpasses: 0 };
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
      const deckY = Math.max(legacy ? (road ? 1.7 : 1.15) : road ? 3.0 : 2.6, aY + 0.15, bY + 0.15), RAMP = road ? 22 : 10;
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
      bridges.push({ kind: 'water', road: ri, i0, i1, deckY, hw, len, bents }); stats.bridges++; stats.bridgeLen += len; stats.pierBents += nb;
    }
  });
  if (fix && !legacy) planOverpasses(roads, t, plans, bridges, stats);
  return { plans, bridges, stats };
}

/** Roads that cross other roads: segment index of every road that stays at ground level. */
function groundRoadGrid(roads: AreaData['roads']) {
  const g = new Grid(32), segs: number[] = [];
  roads.forEach((r, ri) => {
    if (r.b || (r.l ?? 0) > 0 || r.w < 1.5) return; const p = ringOf(r.p), hw = r.w / 2;
    for (let i = 0; i + 1 < p.length; i++) { const id = segs.length / 6; segs.push(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], hw, ri); g.add(id, Math.min(p[i][0], p[i + 1][0]) - hw - 2, Math.min(p[i][1], p[i + 1][1]) - hw - 2, Math.max(p[i][0], p[i + 1][0]) + hw + 2, Math.max(p[i][1], p[i + 1][1]) + hw + 2); }
  });
  /** distance from (x,z) to the nearest ground road edge (<=0 means on it), ignoring road `skip` */
  const clear = (x: number, z: number, skip: number) => { let best = Infinity; const l = g.at(x, z); if (l) for (const id of l) { const o = id * 6; if (segs[o + 5] === skip) continue; best = Math.min(best, distToSeg(x, z, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]) - segs[o + 4]); } return best; };
  return { clear };
}
/** True when a road tag marks an elevated way (OSM bridge=yes or layer>0). */
export const elevated = (r: AreaData['roads'][number]) => !!r.b || (r.l ?? 0) > 0;

/** Overpasses: bridge=yes / layer>0 roads that are not over water. The deck rises from the ground at both ends to a clearance over the
 *  road it crosses (or a lower one when nothing modelled crosses), with pier bents to the ground that never stand on the road beneath. */
function planOverpasses(roads: AreaData['roads'], t: Terrain, plans: RoadPlan[], bridges: Bridge[], stats: { bridges: number; bridgeLen: number; pierBents: number } & Record<string, number>) {
  const gr = groundRoadGrid(roads); stats.overpasses = 0;
  roads.forEach((r, ri) => {
    const plan = plans[ri]; if (!elevated(r) || plan.spans.length || plan.pts.length < 2) return;
    const pts = plan.pts, hw = r.w / 2;
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1]; if (L < 8) return;
    // crossing points (ignore the first / last 12 m, where the way joins its own ramp road)
    let c0 = -1, c1 = -1;
    for (let i = 0; i < pts.length; i++) if (cum[i] > 12 && L - cum[i] > 12 && gr.clear(pts[i][0], pts[i][1], ri) < hw + 0.5) { if (c0 < 0) c0 = i; c1 = i; }
    if (c0 < 0 && r.c > 2) return; // a footpath over nothing: leave it on the ground
    const clearance = c0 >= 0 ? (r.c > 2 ? 4.4 : T.OVER_CLEAR) : T.OVER_FREE;
    const ground = pts.map((p) => groundY(t, p[0], p[1]));
    // running max of the ground over +-18 m, smoothed over +-9 m: the deck always clears the ground beside it
    const win = (f: (i: number) => number, rad: number, fn: 'max' | 'avg') => pts.map((_, i) => { let v = fn === 'max' ? -Infinity : 0, n = 0; for (let j = 0; j < pts.length; j++) if (Math.abs(cum[j] - cum[i]) <= rad) { v = fn === 'max' ? Math.max(v, f(j)) : v + f(j); n++; } return fn === 'max' ? v : v / n; });
    const rm = win((i) => ground[i], 18, 'max'), top = win((i) => rm[i], 9, 'avg').map((v) => v + clearance);
    // full height between the crossing (+-8 m) or the middle fifth, ramp (smoothstep) from each end of the way
    const full0 = c0 >= 0 ? Math.max(cum[c0] - 8, 0) : L * 0.3, full1 = c0 >= 0 ? Math.min(cum[c1] + 8, L) : L * 0.7;
    const y = pts.map((_, i) => {
      const s = cum[i], d = s < full0 ? full0 - s : s > full1 ? s - full1 : 0; if (d === 0) return top[i];
      const run = s < full0 ? Math.max(full0, 1) : Math.max(L - full1, 1), base = ground[i] + (r.c > 2 ? 0.07 : LIFT[r.c] ?? 0.1);
      return base + (top[i] - base) * smooth(1 - d / run);
    });
    const hi = y.map((v, i) => v - ground[i] > 1.2); const i0 = hi.indexOf(true), i1 = hi.lastIndexOf(true); if (i0 < 0 || cum[i1] - cum[i0] < 6) return;
    if (plan.y) return;
    plan.y = y.slice(); plan.spans.push({ i0, i1, kind: 'overpass', deckY: Math.max(...y) });
    // bents every ~10 m along the open span, nudged off the road underneath
    const s0 = cum[i0], s1 = cum[i1], len = s1 - s0, nb = Math.max(2, Math.ceil(len / 10) + 1), bents: [number, number, number][] = [];
    const at = (s: number) => { let i = 0; while (i < pts.length - 2 && cum[i + 1] < s) i++; const u = (s - cum[i]) / Math.max(cum[i + 1] - cum[i], 1e-6); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; };
    for (let k = 0; k < nb; k++) {
      const s = s0 + (len * k) / (nb - 1); let best: number[] | null = null;
      for (const d of [0, 2, -2, 4, -4, 6, -6, 8, -8, 11, -11]) { const ss = Math.min(Math.max(s + d, s0), s1), [x, z] = at(ss); if (gr.clear(x, z, ri) > 1.5 + hw * 0.2) { best = [x, z]; break; } }
      if (!best) best = at(s); // nothing free nearby: stand on the road verge rather than leave the deck unsupported
      if (best) bents.push([best[0], best[1], Math.max(t.heightAt(best[0], best[1]), 0)]);
    }
    bridges.push({ kind: 'overpass', road: ri, i0, i1, deckY: Math.max(...y), hw, len, bents });
    stats.bridges++; stats.overpasses++; stats.bridgeLen += len; stats.pierBents += bents.length;
  });
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
export function cleanArea(area: AreaData, t: Terrain, legacy = false): CleanResult {
  const hit = done.get(area); if (hit) return hit;
  const st: Record<string, number> = {};
  const bump = (k: string, n = 1) => { st[k] = (st[k] ?? 0) + n; };
  const water = (x: number, z: number) => t.heightAt(x, z) < 0;

  // 0) the bake can carry roads from outside the terrain grid (they would hang in the void): keep only the parts inside
  const roads = clipRoads(area.roads, t); st.roadsClipped = area.roads.length - roads.length;
  // 1) ground under roads, bridges (before buildings are judged against the final shore)
  const rp = planRoads(roads, t, true, legacy);
  Object.assign(st, { causewaysBuilt: rp.stats.causeways, bridgesBuilt: rp.stats.bridges, bridgeMetres: Math.round(rp.stats.bridgeLen), pierBents: rp.stats.pierBents, overpassesBuilt: rp.stats.overpasses, causewayVerts: rp.stats.filledVerts });

  // pools first: they level terrain, which buildings must then be fitted to
  // 1b) pools sit on a level pad
  for (const p of area.pools) {
    const pts = ringOf(p); if (pts.length < 3) continue; let lo = Infinity; for (const [x, z] of pts) lo = Math.min(lo, t.heightAt(x, z));
    const y = Math.max(lo, 0.2); vertsNear(t, pts, 1.5, (vi) => { if (t.h[vi] > y - 0.01 && t.h[vi] < y + 1.5) t.h[vi] = y; }); bump('poolsLevelled');
  }

  // 2) buildings: in water -> remove (or fill a wet corner), road / building overlap -> remove, then snap to ground
  const infos = binfo(area.buildings), ri = roadIndex(roads), drop = new Set<number>();
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
  const kept = infos.filter((q) => !drop.has(q.i));
  const groundAt = (q: BInfo) => { const hs: number[] = []; for (let k = 0; k < q.s.length; k += 2) hs.push(Math.max(t.heightAt(q.s[k], q.s[k + 1]), 0)); return hs.sort((a, b) => a - b); };
  for (const q of kept) { // pass A: terraced pad (levels the terrain under and around the footprint)
    if (tiny(q)) continue;
    const hs = groundAt(q), pad = Math.max(hs[Math.floor(hs.length * 0.6)], 0.2);
    vertsNear(t, q.outer, 1, (vi) => { if (Math.abs(t.h[vi] - pad) < T.PAD_TOL && t.h[vi] > 0) t.h[vi] = pad; });
  }
  // pass A2: steep lots. Fill an apron of earth up against the downhill walls (bank falls away at GRADE_SLOPE, never reaching further than GRADE_REACH,
  // never over roads, water, other buildings), so the bare wall that is left is short. Walls still taller than T.EXPOSED get a stepped stone plinth (buildings.ts).
  { const gb = new Grid(32); for (const q of kept) if (!tiny(q)) gb.add(q.i, q.bb[0] - 2, q.bb[1] - 2, q.bb[2] + 2, q.bb[3] + 2);
    const others = (x: number, z: number, self: number) => { const l = gb.at(x, z); if (l) for (const j of l) if (j !== self) { const o = byId2.get(j)!; if (x >= o.bb[0] - 1 && x <= o.bb[2] + 1 && z >= o.bb[1] - 1 && z <= o.bb[3] + 1 && (inPoly(x, z, o.outer) || ringDist(x, z, o.outer) < 1.5)) return true; } return false; };
    const byId2 = new Map(kept.map((q) => [q.i, q] as const));
    for (const q of kept.slice().sort((a, b) => b.area - a.area)) {
      if (tiny(q)) continue;
      const hs = groundAt(q), floor = Math.max(hs[Math.floor(hs.length * 0.35)], hs[hs.length - 1] - 0.45, 0.2);
      if (exposedHeight(q.outer, floor, t.heightAt) <= 0.6) continue;
      let filled = 0;
      vertsNear(t, q.outer, T.GRADE_REACH, (vi, d) => {
        if (d <= 0 || t.h[vi] <= 0.2 || t.cover[vi] === 3) return; // inside the footprint is levelled by pass A; leave water and existing causeways alone
        const ix = vi % t.nx, iz = (vi - ix) / t.nx, x = t.x0 + ix * t.cell, z = t.z0 + iz * t.cell, want = floor - T.GRADE_LIP - d * T.GRADE_SLOPE;
        if (t.h[vi] >= want || want < 0.2) return;
        if (ri.inside(x, z, 1) || ri.near(x, z, 3) || others(x, z, q.i)) return;
        t.h[vi] = want; filled++;
      });
      if (filled) { bump('steepLotsGraded'); bump('gradeFillVerts', filled); }
    }
  }
  const buildings: Building[] = [];
  for (const q of kept) { // pass B: floor + foundation from the final terrain, so nothing floats or sinks
    if (tiny(q)) { buildings.push(q.b); continue; }
    const hs = groundAt(q), lo = hs[0], hi = hs[hs.length - 1];
    const pad = Math.max(hs[Math.floor(hs.length * 0.35)], hi - 0.45, 0.2); // floor never lower than 0.45 m under the highest ground: steep lots get a tall foundation (fy) instead of sinking
    buildings.push({ ...q.b, pad, fy: Math.min(lo, pad) - 0.3 });
    bump('buildingsSnapped');
  }
  st.buildingsKept = buildings.length; st.buildingsRemoved = area.buildings.length - buildings.length;

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
  const out: CleanResult = { area: { ...area, roads, buildings, trees, lamps }, plans: rp.plans, bridges: rp.bridges, walls, stats: st };
  done.set(area, out); return out;
}

// ---- audit ----
export interface WorldView {
  area: AreaData; terrain: Terrain;
  plans?: RoadPlan[]; bridges?: Bridge[]; walls?: ShoreSeg[];
  /** dock plan (see dockPlan.ts): per pier supports; null = raw bake (decks only) */
  poolsRaised?: boolean;
  docks?: DockPlan | null;
  /** road/bridge height query built from the same plans (surface.ts) */
  surface?: RoadSurface;
  /** dock deck height fn (dockPlan.deckAt) */
  deckAt?: (t: Terrain, x: number, z: number) => number;
}
export const ISSUES = ['buildingInWater', 'buildingFloating', 'buildingSunk', 'buildingOverlap', 'buildingOnRoad', 'roadFloating', 'bridgeUnsupported', 'treeBadlyPlaced', 'propBadlyPlaced', 'shorelineGap', 'nonFlatWater', 'pierUnsupported', 'bridgeSolidBelow', 'bridgeNoClearance', 'overpassMissing', 'pilingThroughDeck', 'pilingMisplaced', 'foundationExposed'] as const;
export type Issue = (typeof ISSUES)[number];
export function auditWorld(w: WorldView): { counts: Record<Issue, number>; totals: Record<string, number>; examples: Record<string, unknown[]> } {
  const { area, terrain: t } = w, counts = Object.fromEntries(ISSUES.map((k) => [k, 0])) as Record<Issue, number>, ex: Record<string, unknown[]> = {};
  const note = (k: Issue, v: unknown) => { counts[k]++; (ex[k] ??= []).length < 5 && ex[k].push(v); };
  const infos = binfo(area.buildings), ri = roadIndex(area.roads), real = infos.filter((q) => q.b.m <= 0);
  // buildings
  let maxExposed = 0, sumExposed = 0, over3 = 0;
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
    { const ex = exposedHeight(q.outer, floorRef, t.heightAt); maxExposed = Math.max(maxExposed, ex); sumExposed += ex; if (ex > 3) over3++; if (ex > T.EXPOSED) note('foundationExposed', { ...id, exposed: +ex.toFixed(2) }); }
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
    for (let i = b.i0; i <= b.i1 && !bad; i++) { let near = false; for (const e of b.bents) if (Math.hypot(e[0] - p.pts[i][0], e[1] - p.pts[i][1]) <= (b.kind === 'overpass' ? T.OVER_SPACING : T.PIER_SPACING)) { near = true; break; } if (!near) bad = true; }
    if (bad || b.bents.length < 2) note('bridgeUnsupported', { road: b.road, kind: b.kind, len: Math.round(b.len) });
  }
  void bridged;
  // open underneath: the deck must not be ground beneath it, and there must be headroom to walk / fly / boat under it
  for (const b of w.bridges ?? []) {
    const p = plans[b.road], y = p.y; if (!y) continue; let head = -Infinity, solid = 0, n = 0;
    for (let i = b.i0; i <= b.i1; i++) {
      const [x, z] = p.pts[i], g = Math.max(t.heightAt(x, z), 0); head = Math.max(head, y[i] - 0.65 - g);
      if (y[i] - g > 2.2 && w.surface) { n++; if (w.surface.surfaceAt(x, z, g + 0.3) > y[i] - 1) solid++; }
    }
    if (head < T.UNDER_MIN) note('bridgeNoClearance', { road: b.road, kind: b.kind, headroom: +head.toFixed(2) });
    if (solid) note('bridgeSolidBelow', { road: b.road, kind: b.kind, samples: n, solid });
  }
  // overpasses: elevated roads (OSM bridge=yes / layer>0) that cross a ground road but were left on the ground
  { const gr = groundRoadGrid(area.roads);
    area.roads.forEach((r, k) => {
      const pl = plans[k]; if (!elevated(r) || !pl || pl.spans.length || wetRuns(pl.pts, t).length || pl.pts.length < 2) return;
      let len = 0; for (let i = 1; i < pl.pts.length; i++) len += Math.hypot(pl.pts[i][0] - pl.pts[i - 1][0], pl.pts[i][1] - pl.pts[i - 1][1]); if (len < 8) return;
      let s = 0; for (let i = 0; i < pl.pts.length; i++) { if (i) s += Math.hypot(pl.pts[i][0] - pl.pts[i - 1][0], pl.pts[i][1] - pl.pts[i - 1][1]); if (s > 12 && len - s > 12 && gr.clear(pl.pts[i][0], pl.pts[i][1], k) < r.w / 2 + 0.5) { note('overpassMissing', { road: k, x: Math.round(pl.pts[i][0]), z: Math.round(pl.pts[i][1]) }); break; } }
    }); }
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
    if (hi - Math.max(w.poolsRaised ? hi : lo, 0.2) > T.POOL_SPREAD) note('nonFlatWater', { x: Math.round(pts[0][0]), z: Math.round(pts[0][1]), spread: +(hi - lo).toFixed(2) });
  }
  // piers over water need pilings
  area.piers.forEach((p, k) => {
    const d = w.docks?.piers[k]; if (!d) { if (!w.docks) { const pts = ringOf(p.poly ?? p.line ?? []); if (pts.some(([x, z]) => t.heightAt(x, z) < 0)) note('pierUnsupported', { pier: k }); } return; }
    if (d.over > 0 && d.pilings < Math.max(Math.min(2, d.over), d.over * 0.2)) note('pierUnsupported', { pier: k });
  });
  // dock pilings: only under a deck, never through its surface, inside the deck outline and standing on the seabed
  if (w.docks && w.deckAt) {
    const deckAt = w.deckAt, pl = w.docks.pilings, decks = w.docks.decks;
    for (let i = 0; i + 3 < pl.length; i += 4) {
      const x = pl[i], z = pl[i + 1], bot = pl[i + 2], top = pl[i + 3], id = { x: Math.round(x), z: Math.round(z) };
      if (top > deckAt(t, x, z) - 0.02) note('pilingThroughDeck', { ...id, above: +(top - deckAt(t, x, z)).toFixed(2) });
      if (!decks.some((d) => inPoly(x, z, d.pts)) || bot > Math.max(t.heightAt(x, z), -9) + 0.05) note('pilingMisplaced', id);
    }
  }
  const totals = { maxExposedFoundation: +maxExposed.toFixed(2), meanExposedFoundation: +(sumExposed / Math.max(real.length, 1)).toFixed(3), exposedOver3m: over3, buildings: area.buildings.length, roads: area.roads.length, trees: area.trees.length / 5, lamps: area.lamps.length, pools: area.pools.length, piers: area.piers.length, bridges: (w.bridges ?? []).length, seawallSegments: walls.length, shoreSegments: segs.length };
  return { counts, totals, examples: ex };
}

// ---- road surface query ----
/** Road/bridge surface height query. surfaceAt(x, z, y) returns the highest surface that is not above y + STEP, so a bridge or overpass deck is only
 *  "ground" for someone standing on it and the space under it is open (walk, fly or boat beneath). Without y it returns the highest surface (legacy). */
export const WALK_LIFT = 0.05, WALK_W = 1.8;
export const DECK_T = 0.65; // deck slab thickness: the soffit (underside) is this far below the road surface
export const STEP = 0.9; // a surface this far above the query height still counts as a step up
export interface RoadSurface { surfaceAt(x: number, z: number, y?: number): number; /** highest deck over this spot that is above y (or -Infinity) */ deckAbove(x: number, z: number, y: number): number;
  /** underside of the lowest bridge/overpass slab whose top is above y + STEP (Infinity when none): a solid ceiling for anything below it */ soffitAbove(x: number, z: number, y: number): number }

export function createSurface(roads: AreaData['roads'], t: Terrain, plans?: RoadPlan[], legacy = false): RoadSurface & { addSeg: (...a: number[]) => void } {
  const B = 32, hash = new Map<number, number[]>(), segs: number[] = []; // seg: x0 z0 x1 z1 halfWidth lift y0 y1
  const addSeg = (x0: number, z0: number, x1: number, z1: number, hw: number, lift: number, y0 = NaN, y1 = NaN) => {
    const id = segs.length / 8; segs.push(x0, z0, x1, z1, hw, lift, y0, y1);
    const ax = Math.floor((Math.min(x0, x1) - hw) / B), bx = Math.floor((Math.max(x0, x1) + hw) / B), az = Math.floor((Math.min(z0, z1) - hw) / B), bz = Math.floor((Math.max(z0, z1) + hw) / B);
    for (let i = ax; i <= bx; i++) for (let j = az; j <= bz; j++) { const k = i * 100003 + j; let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(id); }
  };
  const step = Math.max(2, t.cell);
  roads.forEach((r, ri) => {
    const plan = plans?.[ri], pts = plan?.pts ?? resample(ringOf(r.p), step); if (pts.length < 2) return;
    const yc = plan?.y ?? undefined, w = r.w / 2, lift = LIFT[r.c] ?? 0.1;
    const ycAt = (i: number, d: number) => (yc && Number.isFinite(yc[i]) ? yc[i] - d : NaN);
    for (let i = 0; i < pts.length - 1; i++) {
      if (r.c <= 2 && r.w >= 5) addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w + WALK_W, WALK_LIFT, ycAt(i, lift - WALK_LIFT), ycAt(i + 1, lift - WALK_LIFT));
      addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, lift, ycAt(i, 0), ycAt(i + 1, 0));
    }
  });
  const each = (x: number, z: number, fn: (v: number) => void) => {
    const l = hash.get(Math.floor(x / B) * 100003 + Math.floor(z / B)); if (!l) return;
    const h = Math.max(t.heightAt(x, z), 0.05);
    for (const id of l) {
      const o = id * 8, x0 = segs[o], z0 = segs[o + 1], dx = segs[o + 2] - x0, dz = segs[o + 3] - z0, hw = segs[o + 4];
      const L2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2));
      const ex = x0 + dx * u - x, ez = z0 + dz * u - z;
      if (ex * ex + ez * ez > hw * hw) continue;
      const ya = segs[o + 6], yb = segs[o + 7];
      fn(Number.isFinite(ya) && Number.isFinite(yb) ? ya + (yb - ya) * u : h + segs[o + 5]);
    }
  };
  return {
    addSeg,
    surfaceAt(x, z, y = Infinity) {
      const lim = legacy ? Infinity : y + STEP; let best = -Infinity;
      each(x, z, (v) => { if (v <= lim && v > best) best = v; });
      return best === -Infinity ? t.heightAt(x, z) : best;
    },
    soffitAbove(x, z, y) {
      const l = hash.get(Math.floor(x / B) * 100003 + Math.floor(z / B)); if (!l) return Infinity; let best = Infinity;
      for (const id of l) {
        const o = id * 8, ya = segs[o + 6], yb = segs[o + 7]; if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue; // elevated segments only
        const x0 = segs[o], z0 = segs[o + 1], dx = segs[o + 2] - x0, dz = segs[o + 3] - z0, hw = segs[o + 4], L2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2));
        const ex = x0 + dx * u - x, ez = z0 + dz * u - z; if (ex * ex + ez * ez > hw * hw) continue;
        const v = ya + (yb - ya) * u; if (v > y + STEP && v - DECK_T < best) best = v - DECK_T;
      }
      return best;
    },
    deckAbove(x, z, y) { let best = -Infinity; each(x, z, (v) => { if (v > y + STEP && v > best) best = v; }); return best; },
  };
}
