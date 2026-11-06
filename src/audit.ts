/** Spatial placement audit (`window.__auditPlacements(townId?)`): the machine check behind tests/placement.spec.ts.
 *  Flags any pole / lamp / lantern / bench / tree / fountain / gate / building whose centre + radius reaches street asphalt, a junction disc, a footprint or a custom plaza,
 *  any street still crossing a custom town, any town bench whose seat points away from its focus, and any town with no buildings or overlapping building footprints. */
import type { Clearance } from './area/clearance';
import type { TownBuild, TownObj, TownSite } from './area/packTowns';
import type { CityPack } from './area/packCity';

export interface Violation { kind: string; what: string; x: number; z: number; detail?: string }
export interface AuditInput { id: string; ck: Clearance; lampList: number[][]; treeList: number[]; towns: TownBuild | null; city: CityPack | null; sites: TownSite[]; area: { roads: { c: number; w: number; p: number[] }[] } }

const POLE = /lantern|lamp|light|pole|post|mast|beacon|torii|gate|signal|floodlight|windsock|bell/i, BENCH = /bench/i, TREE = /tree|palm|maple|pine|oak|birch|spruce/i;
const corners = (o: { x: number; z: number; rot: number; w: number; d: number }, shrink = 1) => { const c = Math.cos(o.rot), s = Math.sin(o.rot), hw = (o.w * shrink) / 2, hd = (o.d * shrink) / 2; return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([u, v]) => [o.x + u * c + v * s, o.z - u * s + v * c] as [number, number]); };
const sat = (a: [number, number][], b: [number, number][]) => { for (const poly of [a, b]) for (let i = 0; i < 4; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4], nx = -(z1 - z0), nz = x1 - x0; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const [x, z] of a) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const [x, z] of b) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); } if (a1 <= b0 || b1 <= a0) return false; } return true; };

export function auditPlacements(a: AuditInput, townId?: string) {
  const { ck } = a, v: Violation[] = [], counts: Record<string, number> = { lamps: a.lampList.length, trees: a.treeList.length / 5, townObjects: 0, townBuildings: 0, benches: 0, cityObjects: a.city?.placed.length ?? 0, canyonTowers: a.city?.canyon.towers ?? 0, canyonLots: a.city?.canyon.lots ?? 0, canyonNoFit: a.city?.canyon.noFit ?? 0, canyonBlocked: a.city?.canyon.blocked ?? 0 };
  /** full base footprint: the 4 oriented corners + 4 edge midpoints (+ centre) must all clear every asphalt edge and junction disc by `clr` metres */
  const foot = (kind: string, what: string, o: { x: number; z: number; rot: number; w: number; d: number }, clr: number) => {
    const c = Math.cos(o.rot), s = Math.sin(o.rot), hw = o.w / 2, hd = o.d / 2;
    for (const [fu, fv] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]] as const) {
      const x = o.x + fu * hw * c + fv * hd * s, z = o.z - fu * hw * s + fv * hd * c, r = ck.nearestRoad(x, z);
      if (r && r.gap < clr) { v.push({ kind, what, x: +o.x.toFixed(1), z: +o.z.toFixed(1), detail: `footprint point ${r.gap.toFixed(2)} m from asphalt edge (needs >= ${clr.toFixed(2)})` }); return; }
      if (ck.junctionGap(x, z) < clr) { v.push({ kind, what, x: +o.x.toFixed(1), z: +o.z.toFixed(1), detail: 'footprint inside junction disc' }); return; }
    }
  };
  const round = (kind: string, what: string, x: number, z: number, rad: number, clr: number) => { // round base: exact circle, so asphalt edge -> circle edge must be >= clr
    const r = ck.nearestRoad(x, z), jg = ck.junctionGap(x, z);
    if (r && r.gap - rad < clr) v.push({ kind, what, x: +x.toFixed(1), z: +z.toFixed(1), detail: `base edge ${(r.gap - rad).toFixed(2)} m from asphalt edge (needs >= ${clr.toFixed(2)})` });
    else if (jg - rad < clr) v.push({ kind, what, x: +x.toFixed(1), z: +z.toFixed(1), detail: 'base inside junction disc' });
  };
  const sites = townId ? a.sites.filter((s) => s.id === townId) : a.sites;
  if (!townId) { // city-wide objects
    for (const l of a.lampList) round('lamp', 'streetlight', l[0] / 10, l[1] / 10, 0.25, 0.2); // radius 0.25 m
    for (let i = 0; i + 4 < a.treeList.length; i += 5) round('tree', 'tree', a.treeList[i] / 10, a.treeList[i + 1] / 10, 0.4, 0.2); // radius 0.4 m
    for (const o of a.city?.placed ?? []) {
      if (o.kind === 'building') { foot('building', 'pack building', { x: o.x, z: o.z, rot: o.yaw, w: o.L!, d: o.S! }, 0.25); }
      else if (o.kind === 'car') { const g = ck.junctionGap(o.x, o.z); if (g < 4) v.push({ kind: 'car', what: 'car', x: +o.x.toFixed(1), z: +o.z.toFixed(1), detail: `${g.toFixed(1)} m from a junction disc (needs >= 4)` }); } // cars drive in the lane, but stay clear of intersections
      else round(o.kind, o.kind, o.x, o.z, o.r, 0.2); // bench / planter / stop / umbrella: footprint radius
    }
  }
  for (const s of sites) {
    const inRect = (x: number, z: number) => Math.abs(x - s.cx) < s.hx && Math.abs(z - s.cz) < s.hz;
    for (const seg of ck.segments) { // streets must not run through the plaza
      const n = Math.ceil(Math.hypot(seg.bx - seg.ax, seg.bz - seg.az)); for (let k = 0; k <= n; k++) { const x = seg.ax + ((seg.bx - seg.ax) * k) / Math.max(1, n), z = seg.az + ((seg.bz - seg.az) * k) / Math.max(1, n); if (inRect(x, z)) { v.push({ kind: 'road-in-town', what: s.id, x: +x.toFixed(1), z: +z.toFixed(1), detail: 'street asphalt inside the plaza' }); break; } }
    }
    const objs = (a.towns?.objects ?? []).filter((o) => o.town === s.id); counts.townObjects += objs.length;
    const buildings = objs.filter((o) => o.solid && !POLE.test(o.p) && !TREE.test(o.p));
    counts.townBuildings += buildings.length;
    if (!buildings.length) v.push({ kind: 'town-empty', what: s.id, x: s.cx, z: s.cz, detail: '0 buildings' });
    for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) if (sat(corners(buildings[i], 0.92), corners(buildings[j], 0.92))) v.push({ kind: 'building-overlap', what: `${buildings[i].p} / ${buildings[j].p}`, x: +buildings[i].x.toFixed(1), z: +buildings[i].z.toFixed(1) });
    const fountains = s.def.fountains(s.y).map((f) => [s.cx + f.x, s.cz + f.z] as const), focus = fountains[0] ?? [s.cx, s.cz];
    const benchObjs: (TownObj | { p: string; x: number; z: number; rot: number })[] = [...objs.filter((o) => BENCH.test(o.p)), ...(a.towns?.real ?? []).filter((o) => BENCH.test(o.p) && inRect(o.x, o.z)).map((o) => ({ p: o.p, x: o.x, z: o.z, rot: o.rot }))];
    for (const o of objs) foot('town-' + (o.solid ? 'building' : 'prop'), o.p, { x: o.x, z: o.z, rot: o.rot, w: Math.max(o.w, 0.3), d: Math.max(o.d, 0.3) }, 0.2); // EVERY custom object, whole footprint
    for (const o of (a.towns?.real ?? [])) if (inRect(o.x, o.z)) round('town-real', o.p, o.x, o.z, Math.max(0.6, 0.45 * o.s), 0.2); // textured pack models: radius from the item scale
    s.def.fountains(s.y).forEach((f) => round('town-fountain', 'fountain', s.cx + f.x, s.cz + f.z, f.radius, 0.2)); // basin radius
    for (const b of benchObjs) {
      counts.benches++;
      const dx = focus[0] - b.x, dz = focus[1] - b.z, L = Math.hypot(dx, dz) || 1, dot = (Math.sin(b.rot) * dx + Math.cos(b.rot) * dz) / L; // seat faces model +z (tools/bench-axis.mjs)
      if (dot < 0.3) v.push({ kind: 'bench-facing', what: b.p, x: +b.x.toFixed(1), z: +b.z.toFixed(1), detail: `seat-forward . focus = ${dot.toFixed(2)} (needs >= 0.3)` });
    }
  }
  return { area: a.id, town: townId ?? null, counts, violations: v };
}
