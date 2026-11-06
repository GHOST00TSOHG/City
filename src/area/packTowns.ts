/** Six custom small towns built from the owned packs, each seated inside one of the five areas:
 *  edo (bayshore), cyber (newark), paris (passaic), harbor + airfield (keywest), outpost (sandyhook).
 *  Site choice, pads, footprints and collider boxes are registered BEFORE terrain, roads, buildings, trees and grass are built (scene.ts), so the ground is levelled
 *  under the town and nothing grows through it. All pack geometry is stamped into one merged mesh per town (packLibrary.ts); fountains are animated (fountains.ts). */
import * as THREE from 'three/webgpu';
import type { AreaData, Terrain } from './data';
import type { LandmarkPad, LandmarkFootprint, LandmarkCollider } from './landmarks';
import { loadProto, PackBatch, createPackMaterial, type Proto } from './packLibrary';
import { buildFountains, type FountainSpec } from './fountains';
import { buildGlowPools, glowFor, type GlowSpec } from './glowPools';
import { ringPts } from './geom';
import { townDefs, setTownExclusion, type TownDef, type Item } from './townDefs';

export interface TownMeta { id: string; name: string; area: string }
export const TOWN_META: TownMeta[] = townDefs.map(({ id, name, area }) => ({ id, name, area }));

export interface TownSite {
  id: string; name: string; area: string; cx: number; cz: number; y: number; hx: number; hz: number;
  pad: LandmarkPad; footprint: LandmarkFootprint; def: TownDef;
  /** where the player stands in front of the centrepiece, and what they look at (world metres) */
  stand: [number, number, number]; look: [number, number, number];
}

let material: THREE.Material | null = null;
export const packMaterial = () => (material ??= createPackMaterial());

const D2R = Math.PI / 180;
const avoidRect = (a: { x: number; z: number; r: number }[], x: number, z: number, hx: number, hz: number) => a.some((q) => x + hx > q.x - q.r && x - hx < q.x + q.r && z + hz > q.z - q.r && z - hz < q.z + q.r);

/** Picks a flat, dry, uncluttered rectangle (few roads and buildings) near the town's anchor. Deterministic for a given area bake. */
function findSite(def: TownDef, area: AreaData, t: Terrain, avoid: { x: number; z: number; r: number }[], anchor: [number, number] | null) {
  const [hx, hz] = def.half, G = 10, W = Math.ceil(((t.nx - 1) * t.cell) / G) + 2, Hh = Math.ceil(((t.nz - 1) * t.cell) / G) + 2;
  const x0 = t.x0, z0 = t.z0, cellOf = (x: number, z: number) => Math.floor((z - z0) / G) * W + Math.floor((x - x0) / G);
  const roadN = new Uint16Array(W * Hh), bldN = new Uint16Array(W * Hh);
  for (const r of area.roads) { if (r.c > 2) continue; for (let i = 0; i + 3 < r.p.length; i += 2) { const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5)); for (let k = 0; k <= n; k++) { const c = cellOf(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n); if (c >= 0 && c < roadN.length) roadN[c]++; } } }
  for (const b of area.buildings) { if (b.m > 0) continue; const c = cellOf(b.o[0] / 10, b.o[1] / 10); if (c >= 0 && c < bldN.length) bldN[c] += 1; }
  const maxX = x0 + (t.nx - 1) * t.cell, maxZ = z0 + (t.nz - 1) * t.cell, margin = Math.max(hx, hz) + 60;
  let best: { x: number; z: number; s: number } | null = null, strict: { x: number; z: number; s: number } | null = null;
  const step = 20;
  for (let z = z0 + margin; z < maxZ - margin; z += step) for (let x = x0 + margin; x < maxX - margin; x += step) {
    if (avoidRect(avoid, x, z, hx, hz)) continue;
    let lo = Infinity, hi = -Infinity, wet = 0, sum = 0, n = 0;
    for (let dz = -hz; dz <= hz; dz += G) for (let dx = -hx; dx <= hx; dx += G) { const h = t.heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++; if (h < 0.6) wet++; }
    if (wet) continue; // dry ground only
    if (lo < def.minH) continue;
    let roads = 0, blds = 0;
    for (let dz = -hz; dz <= hz; dz += G) for (let dx = -hx; dx <= hx; dx += G) { const c = cellOf(x + dx, z + dz); if (c >= 0 && c < roadN.length) { roads += roadN[c]; blds += bldN[c]; } }
    let s = (hi - lo) * 14 + roads * 2.2 + blds * 1.6, ring = 0;
    // a road must not cross the plaza (+1 cell): strict sites win; a road 10-30 m outside the rect is rewarded so the plaza opens onto a street
    if (!roads) for (let dz = -hz - 3 * G; dz <= hz + 3 * G; dz += G) for (let dx = -hx - 3 * G; dx <= hx + 3 * G; dx += G) { if (Math.abs(dx) <= hx + G && Math.abs(dz) <= hz + G) continue; const c = cellOf(x + dx, z + dz); if (c >= 0 && c < roadN.length && roadN[c]) ring++; }
    if (!def.water) { let w = 0; for (let a = 0; a < 16; a++) for (const rr of [Math.max(hx, hz) + 14, Math.max(hx, hz) + 34]) if (t.heightAt(x + Math.cos((a / 16) * 6.283) * rr, z + Math.sin((a / 16) * 6.283) * rr) < 0.4) w++; s += w * 9; }
    if (def.water) { let w = 0; for (let a = 0; a < 16; a++) for (const rr of [Math.max(hx, hz) + 25, Math.max(hx, hz) + 60]) if (t.heightAt(x + Math.cos((a / 16) * 6.283) * rr, z + Math.sin((a / 16) * 6.283) * rr) < 0.2) w++; s += (w ? 0 : 60) - w * 0.8; }
    if (anchor) s += Math.hypot(x - anchor[0], z - anchor[1]) / 25;
    if (!roads && !blds) { const sc = s - Math.min(ring, 10) * 0.9; if (!strict || sc < strict.s) strict = { x, z, s: sc }; }
    if (!best || s < best.s) best = { x, z, s };
  }
  best = strict ?? best;
  return best ? { x: best.x, z: best.z, y: (() => { let sum = 0, n = 0; for (let dz = -hz; dz <= hz; dz += 5) for (let dx = -hx; dx <= hx; dx += 5) { sum += t.heightAt(best!.x + dx, best!.z + dz); n++; } return Math.round((sum / n) * 100) / 100; })() } : null;
}

/** Plans every town of an area: chooses sites, builds their pads and footprints. Call before the terrain is levelled / built. */
export function planTowns(areaId: string, area: AreaData, t: Terrain, avoid: { x: number; z: number; r: number }[], anchors: Record<string, [number, number]>): TownSite[] {
  const out: TownSite[] = [], taken = [...avoid];
  for (const def of townDefs.filter((d) => d.area === areaId)) {
    const f = findSite(def, area, t, taken, anchors[def.id] ?? null); if (!f) { console.warn('[City] no site for town', def.id); continue; }
    const { hx, hz } = { hx: def.half[0], hz: def.half[1] }, x = f.x, z = f.z;
    taken.push({ x, z, r: Math.max(hx, hz) + 12 });
    const pts: [number, number][] = [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];
    const pad: LandmarkPad = { id: 'town-' + def.id, pts, y: f.y, minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
    const footprint: LandmarkFootprint = { id: 'town-' + def.id, pts, margin: 4, minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
    const [sv, lk] = [def.view?.stand ?? [0, hz * 0.62], def.view?.look ?? [0, -hz * 0.5, 4]];
    out.push({ id: def.id, name: def.name, area: areaId, cx: x, cz: z, y: f.y, hx, hz, pad, footprint, def, stand: [x + sv[0], f.y, z + sv[1]], look: [x + lk[0], f.y + lk[2], z + lk[1]] });
  }
  setTownExclusion(areaId, out.map((q) => ({ x0: q.cx - q.hx, z0: q.cz - q.hz, x1: q.cx + q.hx, z1: q.cz + q.hz })));
  return out;
}

/** Road polylines with every point inside a town rectangle removed (the plaza replaces the street); remaining runs keep their class and width. */
export function carveRoads(roads: AreaData['roads'], sites: TownSite[]): AreaData['roads'] {
  if (!sites.length) return roads;
  const PAD = 0.5; // the plaza edge meets the street end; nothing is left inside the rectangle
  const inside = (x: number, z: number) => sites.some((s) => Math.abs(x - s.cx) < s.hx + PAD && Math.abs(z - s.cz) < s.hz + PAD);
  const hits = (ax: number, az: number, bx: number, bz: number) => sites.some((s) => Math.max(ax, bx) > s.cx - s.hx - PAD && Math.min(ax, bx) < s.cx + s.hx + PAD && Math.max(az, bz) > s.cz - s.hz - PAD && Math.min(az, bz) < s.cz + s.hz + PAD);
  const out: AreaData['roads'] = [];
  for (const r of roads) {
    const pts = ringPts(r.p); let run: number[] = [];
    const flush = () => { if (run.length >= 4) out.push({ ...r, p: run }); run = []; };
    const push = (x: number, z: number) => run.push(Math.round(x * 10), Math.round(z * 10));
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      // a long segment can cross the plaza with both ends outside it: walk it in 1 m steps so the crossing is cut too (the old vertex-only test left Edo's through-road and Harbor's lane lines)
      if (i > 0 && hits(pts[i - 1][0], pts[i - 1][1], x, z)) {
        const [px, pz] = pts[i - 1], L = Math.hypot(x - px, z - pz), n = Math.ceil(L);
        for (let k = 1; k < n; k++) { const sx = px + ((x - px) * k) / n, sz = pz + ((z - pz) * k) / n; if (inside(sx, sz)) flush(); else push(sx, sz); }
      }
      if (inside(x, z)) flush(); else push(x, z);
    }
    flush();
  }
  return out;
}

function boxCollider(cx: number, cz: number, w: number, d: number, rot: number, y0: number, y1: number): LandmarkCollider {
  const cs = Math.cos(rot), sn = Math.sin(rot), hw = w / 2, hd = d / 2;
  const c = ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([u, v]) => [cx + u * cs + v * sn, cz - u * sn + v * cs] as const);
  const tris: number[] = [], P = (i: number, y: number) => [c[i][0], y, c[i][1]];
  const quad = (a: number[], b: number[], cc: number[], d2: number[]) => tris.push(...a, ...b, ...cc, ...a, ...cc, ...d2);
  quad(P(0, y1), P(3, y1), P(2, y1), P(1, y1));
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(P(i, y0), P(j, y0), P(j, y1), P(i, y1)); }
  return { tris: new Float32Array(tris), minX: Math.min(...c.map((q) => q[0])), maxX: Math.max(...c.map((q) => q[0])), minZ: Math.min(...c.map((q) => q[1])), maxZ: Math.max(...c.map((q) => q[1])) };
}

/** every pack model placed in a town, in world metres (the placement audit reads these) */
export interface TownObj { town: string; p: string; x: number; z: number; rot: number; w: number; d: number; solid: boolean }
export interface TownBuild { objects: TownObj[]; group: THREE.Group; colliders: LandmarkCollider[]; tris: number; placed: number; packs: Set<string>; paths: Set<string>; real: { p: string; x: number; y: number; z: number; rot: number; s: number }[] }
const TRI_CAP = 1_300_000;

/** Stamps one area's towns (after the terrain has been levelled under their pads). */
export async function buildTowns(sites: TownSite[], t: Terrain): Promise<TownBuild> {
  const group = new THREE.Group(); group.name = 'towns';
  const res: TownBuild = { objects: [], group, colliders: [], tris: 0, placed: 0, packs: new Set(), paths: new Set(), real: [] };
  const mat = packMaterial(), fountains: FountainSpec[] = [], glows: GlowSpec[] = [];
  for (const site of sites) {
    const items: Item[] = site.def.items(), batch = new PackBatch(TRI_CAP / Math.max(1, sites.length));
    const protos = new Map<string, Proto | null>();
    await Promise.all([...new Set(items.filter((i) => i.p).map((i) => i.p))].map(async (p) => protos.set(p, await loadProto(p))));
    const gy = (x: number, z: number) => Math.max(t.heightAt(x, z), site.y);
    for (const it of items) {
      const x = site.cx + it.u, z = site.cz + it.v, rot = (it.rot ?? 0) * D2R;
      if (it.box) { batch.addBox(x, z, it.box.w, it.box.d, rot, site.y + (it.box.y0 ?? 0), site.y + it.box.y1, it.box.rgb, it.box.rough ?? 0.88, it.box.emissive ?? 0); if (it.solid) res.colliders.push(boxCollider(x, z, it.box.w, it.box.d, rot, site.y, site.y + it.box.y1)); continue; }
      if (it.ring) { batch.addRing(x, z, it.ring.r0, it.ring.r1, site.y + (it.ring.y0 ?? 0), site.y + it.ring.y1, it.ring.rgb, 24, it.ring.rough ?? 0.88, it.ring.emissive ?? 0); continue; }
      const p = protos.get(it.p); if (!p) continue;
      const sx = it.s ?? 1, sy = it.sy ?? sx;
      const y = it.tile ? gy(x, z) + 0.03 - p.h * sy : gy(x, z) + (it.y ?? 0);
      if (!batch.add(p, x, y, z, rot, sx, sy, sx)) continue;
      { const g = glowFor(it.p, glows.length); if (g) glows.push({ x, y: gy(x, z) + 0.05, z, r: g.r, rgb: g.rgb, e: g.e }); } // a light pool exists only under a real fixture
      res.objects.push({ town: site.id, p: it.p, x, z, rot, w: p.w * sx, d: p.d * sx, solid: !!it.solid });
      res.placed++; res.paths.add(it.p); res.packs.add(it.p.split('/')[0]);
      if (it.solid) { const w = p.w * sx, d = p.d * sx, quarter = Math.abs(Math.sin(rot * 2)) < 0.01; res.colliders.push(boxCollider(x, z, quarter ? w : Math.max(w, d), quarter ? d : Math.max(w, d), rot, y, y + p.h * sy)); }
    }
    for (const r of site.def.real ?? []) res.real.push({ p: r.p, x: site.cx + r.u, y: Math.max(t.heightAt(site.cx + r.u, site.cz + r.v), site.y), z: site.cz + r.v, rot: (r.rot ?? 0) * D2R, s: r.s ?? 1 });
    for (const f of site.def.fountains(site.y)) fountains.push({ ...f, x: site.cx + f.x, z: site.cz + f.z, y: site.y + f.y });
    const slab = site.def.slab; // plaza floor support for walkers: a 3 cm collider over the paved area
    if (slab) res.colliders.push(boxCollider(site.cx + slab.u, site.cz + slab.v, slab.w, slab.d, 0, site.y - 0.4, site.y + 0.03));
    const mesh = batch.build('town ' + site.id, mat);
    if (mesh) { group.add(mesh); res.tris += batch.tris; }
  }
  if (fountains.length) group.add(buildFountains(fountains).group);
  const gm = buildGlowPools(glows); if (gm) group.add(gm);
  return res;
}
