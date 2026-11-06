/** City-wide pack content for one area, built before the procedural building chunks:
 *  - standalone rectangular OSM footprints are matched to pack buildings by footprint size, height and the area's style, seated on a plinth, and removed from the procedural list;
 *  - street life along the roads (benches, planters, bus stops, parked cars, cafe umbrellas, tactile crossing beacons at the zebra crossings);
 *  - rooftop props on large flat roofs that stay procedural.
 *  Everything is stamped into one merged mesh (packLibrary.ts). Palms are never used here: they exist only in Key West's harbor town. */
import * as THREE from 'three/webgpu';
import type { Building, Terrain, AreaData } from './data';
import type { LandmarkCollider } from './landmarks';
import { ringPts, signedArea } from './geom';
import { foundation } from './foundation';
import { junctionSpots } from './ground';
import { loadProto, PackBatch, type Proto } from './packLibrary';
import { packMaterial } from './packTowns';
import type { Clearance } from './clearance';
import { isInTownExclusion } from './townDefs';
import { registry } from '../world/registry';
import { releaseTextureSources } from './landmarks';

const mk = (pack: string) => (f: string) => `${pack}/${f}.glb`;
const mt = mk('metropolis'), sb = mk('suburban-neighborhood'), cz = mk('cozy-village'), vb = mk('vice-beach'), ci = mk('city'), pa = mk('city-paris'), ac = mk('accessibility'), cy = mk('cyberpunk');

/** Candidate models per area style. `h` = nominal pack height used to choose by building height. */
const TALL = [mt('glass_supertall_01'), mt('crown_tower_01'), mt('midrise_office_01'), mt('residential_highrise_01')];
const MID = [mt('midrise_office_01'), mt('condo_midrise_01'), mt('retail_podium_01')];
const LOW_URBAN = [mt('corner_shop_01'), mt('retail_infill_01'), ci('brownstone_01')];
const HOUSES = [sb('bungalow_house'), sb('ranch_house'), sb('two_story_house'), cz('home_cottage_01')];
const COASTAL = [vb('deco_apartment_walkup'), vb('motel_l_wing'), vb('corner_bodega_liquor'), vb('deco_shopfront_row'), cz('home_cottage_01'), sb('bungalow_house')];
const STYLE: Record<string, { tall: string[]; mid: string[]; low: string[]; cap: number }> = {
  newark: { tall: TALL, mid: MID, low: LOW_URBAN, cap: 260 }, passaic: { tall: TALL, mid: MID, low: LOW_URBAN, cap: 260 },
  bayshore: { tall: MID, mid: LOW_URBAN, low: HOUSES, cap: 240 }, sandyhook: { tall: HOUSES, mid: HOUSES, low: HOUSES, cap: 80 }, keywest: { tall: COASTAL, mid: COASTAL, low: COASTAL, cap: 280 },
};
/** Newark downtown skyscraper canyon: curated metropolis high-rises (scaled 50-95 m) on the footprints flanking the straight curbed avenue the `downtown` view looks down (Newark-local metres; shifted to world space in `blvd`). */
const CANYON_TOWERS = ['glass_supertall_01', 'crown_tower_01', 'twisting_supertall_01', 'corporate_hq_01', 'twin_tower_01', 'hotel_tower_01', 'mixeduse_tower_01', 'residential_highrise_01'].map(mt);
const BLVD_LOCAL: [number, number][] = [[1231, 386], [1220, 421], [1211, 445], [1195, 490], [1188, 510], [1162, 583]], CANYON_MAX = 14;
/** lateral distance from the avenue centreline and distance along it from the view end */
function blvd(x: number, z: number) { // x / z in world metres (area data is world-space): shift the Newark-local polyline by Newark's world offset
  const o = registry.get('newark').worldOffset, BLVD = BLVD_LOCAL.map(([a, b]) => [a + o.x, b + o.z] as [number, number]);
  let best = 1e9, al = 0, acc = 0;
  for (let i = 0; i + 1 < BLVD.length; i++) {
    const [ax, az] = BLVD[i], [bx, bz] = BLVD[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))), d = Math.hypot(x - ax - t * dx, z - az - t * dz);
    if (d < best) { best = d; al = acc + t * L; } acc += L;
  }
  return { d: best, al };
}
const CHEAP_TRIS = 14000; // models above this are used sparingly

const hash = (n: number) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** Minimum-area bounding rectangle of a ring: centre, yaw (radians), lengths along / across, and how fully the ring fills it. */
function fitRect(ring: [number, number][]) {
  let best: { a: number; L: number; S: number; cx: number; cz: number; area: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], a = Math.atan2(z1 - z0, x1 - x0), c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) { const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2; best = { a, L: u1 - u0, S: v1 - v0, cx: mu * c - mv * s, cz: mu * s + mv * c, area }; }
  }
  const fill = best ? Math.abs(signedArea(ring)) / best.area : 0;
  return best ? { ...best, fill } : null;
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

/** placed street objects and replaced buildings (placement audit) */
export interface CityObj { kind: 'car' | 'bench' | 'planter' | 'stop' | 'umbrella' | 'building'; x: number; z: number; r: number; yaw: number; L?: number; S?: number }
export interface CityPack { /** Newark downtown canyon: skyline-tower lots seen / placed, and why the rest failed */ canyon: { lots: number; towers: number; noFit: number; blocked: number }; placed: CityObj[]; group: THREE.Group; rest: Building[]; colliders: LandmarkCollider[]; replaced: number; furniture: number; roofProps: number; tris: number; paths: Set<string> }

export async function buildPackCity(areaId: string, buildings: Building[], area: AreaData, t: Terrain, center: [number, number], ck: Clearance): Promise<CityPack> {
  const group = new THREE.Group(); group.name = 'pack city';
  const out: CityPack = { canyon: { lots: 0, towers: 0, noFit: 0, blocked: 0 }, placed: [], group, rest: buildings, colliders: [], replaced: 0, furniture: 0, roofProps: 0, tris: 0, paths: new Set() };
  const st = STYLE[areaId]; if (!st) return out;
  const batch = new PackBatch(areaId === 'newark' ? 760_000 : 520_000), protos = new Map<string, Proto | null>();
  const get = async (p: string) => { if (!protos.has(p)) protos.set(p, await loadProto(p)); return protos.get(p)!; };
  const used = (p: string) => out.paths.add(p);

  // 1) building replacement ------------------------------------------------------------------------------------------------------------------
  const partCells = new Set<string>(); for (const b of buildings) if (b.m > 0) partCells.add(Math.round(b.o[0] / 100) + ',' + Math.round(b.o[1] / 100));
  const cand: { b: Building; ring: [number, number][]; r: NonNullable<ReturnType<typeof fitRect>>; d: number; canyon: boolean }[] = [];
  for (const b of buildings) {
    if (b.m > 0 || b.r.length !== 1 || b.h < 4) continue;
    const cn = areaId === 'newark' ? blvd(b.o[0] / 10, b.o[1] / 10) : null, canyon = !!cn && cn.d > 12 && cn.d < 100 && cn.al < 320;
    const ring = ringPts(b.r[0]) as [number, number][]; if (ring.length < 4 || ring.length > (canyon ? 24 : 14)) continue;
    const r = fitRect(ring); if (!r || r.fill < (canyon ? 0.7 : 0.86)) continue;
    if (Math.min(r.L, r.S) < (canyon ? 8 : 6.5) || Math.max(r.L, r.S) > 64) continue;
    let hasPart = false; for (let i = -1; i <= 1 && !hasPart; i++) for (let j = -1; j <= 1; j++) if (partCells.has(Math.round(b.o[0] / 100) + i + ',' + (Math.round(b.o[1] / 100) + j))) { hasPart = true; break; }
    if (hasPart) continue;
    cand.push({ b, ring, r, canyon, d: canyon ? cn!.al - 1e6 : Math.hypot(b.o[0] / 10 - center[0], b.o[1] / 10 - center[1]) }); // canyon lots first, nearest the view first
  }
  cand.sort((a, b) => a.d - b.d);
  const replacedSet = new Set<Building>(); let heavy = 0, nCanyon = 0;
  for (const c of cand) {
    if (replacedSet.size >= st.cap || batch.tris > (areaId === 'newark' ? 660_000 : 420_000)) break;
    if (c.canyon && nCanyon >= CANYON_MAX) continue;
    if (c.canyon) out.canyon.lots++;
    const { b, ring, r } = c, seed = ((b.o[0] * 73856093) ^ (b.o[1] * 19349663)) >>> 0;
    const list = c.canyon ? CANYON_TOWERS : b.h >= (areaId === 'newark' ? 30 : 45) ? st.tall : b.h >= 18 ? st.mid : st.low, towerH = 50 + hash(seed + 31) * 45; // Newark downtown: curated glass high-rises from 30 m; canyon lots become 50-95 m towers
    let pick: { p: Proto; sx: number; sz: number; sy: number; flip: boolean; dist: number } | null = null;
    for (let k = 0; k < 4; k++) {
      const path = list[Math.floor(hash(seed + k * 977) * list.length)], p = await get(path); if (!p) continue;
      if (p.tris > CHEAP_TRIS && heavy > 36 && !c.canyon) continue;
      for (const flip of [false, true]) {
        const L = flip ? r.S : r.L, S = flip ? r.L : r.S, sx = L / p.w, sz = S / p.d, ratio = sx / sz;
        if (c.canyon ? (ratio < 0.4 || ratio > 2.6 || sx > 4.2 || sx < 0.3 || sz > 4.2 || sz < 0.3) : (ratio < 0.55 || ratio > 1.8 || sx > 3.4 || sx < 0.45 || sz > 3.4 || sz < 0.45)) continue;
        const sy = c.canyon ? Math.min(Math.max(towerH / p.h, 0.6), 3) : Math.min(Math.max(b.h / p.h, 0.7), b.h >= 45 ? 2.2 : 1.7), dist = Math.abs(Math.log(ratio)) + (c.canyon ? 0 : Math.abs(Math.log(b.h / (p.h * sy))));
        if (!pick || dist < pick.dist) pick = { p, sx, sz, sy, flip, dist };
      }
    }
    if (!pick) { if (c.canyon) out.canyon.noFit++; continue; }
    // the replacement must keep clear of every street (not only its own), every junction disc and any custom town: sample its rectangle's corners and edge midpoints
    { const ca = Math.cos(r.a), sa = Math.sin(r.a); let bad = false;
      for (const [fu, fv] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [0, -.5], [0, .5], [-.5, 0], [.5, 0]]) { const x = r.cx + (fu * r.L) * ca - (fv * r.S) * sa, z = r.cz + (fu * r.L) * sa + (fv * r.S) * ca, q = ck.nearestRoad(x, z); if ((q && q.gap < 0.25) || ck.junctionGap(x, z) < 0.4 || isInTownExclusion(areaId, x, z, 2)) { bad = true; break; } }
      if (bad) { if (c.canyon) out.canyon.blocked++; continue; } }
    const { p, sx, sz, sy, flip } = pick, rings = [ring], f = foundation(rings, t), yaw = -r.a + (flip ? Math.PI / 2 : 0);
    if (p.tris > CHEAP_TRIS) heavy++;
    if (c.canyon) { nCanyon++; out.canyon.towers++; }
    if (f.floor - f.minT > 0.12) batch.addBox(r.cx, r.cz, r.L + 0.3, r.S + 0.3, -r.a, f.bottom, f.floor + 0.02, [0.5, 0.49, 0.46], 0.9); // concrete plinth so nothing floats on a slope
    if (!batch.add(p, r.cx, f.floor, r.cz, yaw, sx, sy, sz)) break;
    used(p.path); replacedSet.add(b); out.replaced++; out.placed.push({ kind: 'building', x: r.cx, z: r.cz, r: Math.hypot(r.L, r.S) / 2, yaw: -r.a, L: r.L, S: r.S });
    out.colliders.push(boxCollider(r.cx, r.cz, r.L, r.S, -r.a, f.floor - 0.2, f.floor + p.h * sy));
  }
  out.rest = buildings.filter((b) => !replacedSet.has(b));

  // 2) rooftop props on large flat roofs that stay procedural --------------------------------------------------------------------------------
  const roofKit = [await get(cy('rooftop_ac_cluster'))].filter(Boolean) as Proto[];
  if (roofKit.length && (areaId === 'newark' || areaId === 'passaic' || areaId === 'bayshore')) {
    let n = 0;
    for (const b of out.rest) {
      if (n >= 34) break;
      if (b.m > 0 || b.s !== 'flat' || b.h < 10 || b.r.length !== 1) continue;
      const ring = ringPts(b.r[0]) as [number, number][]; if (ring.length < 4 || Math.abs(signedArea(ring)) < 380) continue;
      const seed = ((b.o[0] * 73856093) ^ (b.o[1] * 19349663)) >>> 0; if (hash(seed) > 0.22) continue;
      const p = roofKit[Math.floor(hash(seed + 5) * roofKit.length)], f = foundation([ring], t);
      if (!batch.add(p, b.o[0] / 10, f.floor + b.h, b.o[1] / 10, hash(seed + 9) * 6.28, 1.6)) break;
      used(p.path); n++; out.roofProps++;
    }
  }

  // 3) street life ---------------------------------------------------------------------------------------------------------------------------
  const sp = junctionSpots(area.roads), near = (x: number, z: number, pad: number) => sp.centres.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad);
  const furniture = (areaId === 'keywest' ? [vb('beach_umbrella')] : [pa('cafe_parasol_01')]);
  const cars = [mt('sedan_01'), mt('metropolis_taxi_01')];
  const bench = [mt('plaza_bench_01')], planter = [mt('plaza_planter_01')], stop = [mt('bus_stop_flag_01')];
  let nCar = 0, nBench = 0, nPlant = 0, nStop = 0, nUmb = 0;
  const lift = sp.walkLift, gy = (x: number, z: number) => Math.max(t.heightAt(x, z), 0.05);
  for (const [ri, rd] of area.roads.entries()) {
    if (rd.c > 2 || rd.w < 5) continue;
    const pts = ringPts(rd.p), hw = rd.w / 2; let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1) continue;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux, yaw = Math.atan2(ux, uz);
      for (let d = 14 - (acc % 28); d < L - 6; d += 28) {
        if (d < 6) continue;
        const x = ax + ux * d, z = az + uz * d, seed = ((Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663)) >>> 0, r = hash(seed);
        if (Math.hypot(x - center[0], z - center[1]) > 520 || near(x, z, 8)) continue;
        const side = hash(seed + 3) < 0.5 ? 1 : -1;
        // furniture sits on the outer sidewalk strip (hw + 0.75 .. 1.8 m from the centreline), never beside a different street, a junction or inside a footprint / custom town
        const strip = (off: number, rad: number) => { const ox = x + nx * side * (hw + off), oz = z + nz * side * (hw + off); return ck.ok(ox, oz, rad) && ck.onStrip(ox, oz) ? [ox, oz] as const : null; };
        const lane = () => { const ox = x + nx * side * (hw - 1.3), oz = z + nz * side * (hw - 1.3), other = ck.nearestRoad(ox, oz, ri); // cars: curbside lane, >= junction r + 4 m from any junction, not on a crossing street
          return ck.junctionGap(ox, oz) >= 4 && (!other || other.gap > 3) && !isInTownExclusion(areaId, ox, oz, 3) && !ck.inBuilding(ox, oz) ? [ox, oz] as const : null; };
        if (r < 0.36 && nCar < 150) { const q = lane(); if (q) { const p = await get(cars[Math.floor(hash(seed + 1) * cars.length)]); if (p && batch.add(p, q[0], gy(q[0], q[1]) + 0.06, q[1], yaw + (side > 0 ? 0 : Math.PI), 1.55)) { nCar++; used(p.path); out.placed.push({ kind: 'car', x: q[0], z: q[1], r: 1.2, yaw }); } } }
        else if (r < 0.5 && nBench < 56) { const q = strip(1.3, 0.8); if (q) { const p = await get(bench[0]); if (p && batch.add(p, q[0], gy(q[0], q[1]) + lift, q[1], yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 1.5)) { nBench++; used(p.path); out.placed.push({ kind: 'bench', x: q[0], z: q[1], r: 0.8, yaw: yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2) }); } } } // model seat faces +z (tools/bench-axis.mjs): seat toward the street
        else if (r < 0.6 && nPlant < 40) { const q = strip(0.95, 0.7); if (q) { const p = await get(planter[0]); if (p && batch.add(p, q[0], gy(q[0], q[1]) + lift, q[1], yaw, 1.5)) { nPlant++; used(p.path); out.placed.push({ kind: 'planter', x: q[0], z: q[1], r: 0.7, yaw }); } } }
        else if (r < 0.64 && nStop < 14) { const q = strip(1.6, 1.0); if (q) { const p = await get(stop[Math.floor(hash(seed + 2) * stop.length)]); if (p && batch.add(p, q[0], gy(q[0], q[1]) + lift, q[1], yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 1.5)) { nStop++; used(p.path); out.placed.push({ kind: 'stop', x: q[0], z: q[1], r: 1, yaw }); } } }
        else if (r < 0.68 && nUmb < 14) { const q = strip(1.8, 1.2); if (q) { const p = await get(furniture[0]); if (p && batch.add(p, q[0], gy(q[0], q[1]) + lift, q[1], hash(seed + 4) * 6.28, 1.4)) { nUmb++; used(p.path); out.placed.push({ kind: 'umbrella', x: q[0], z: q[1], r: 1.2, yaw }); } } }
      }
      acc += L;
    }
  }
  let nBeacon = 0; const bp = await get(ac('beacon_crossing_tactile_01'));
  if (bp) for (const q of sp.beacons) {
    if (nBeacon >= 26) break; if (Math.hypot(q.x - center[0], q.z - center[1]) > 420) continue;
    if (batch.add(bp, q.x, gy(q.x, q.z) + (q.walk ? lift : 0.06), q.z, q.yaw, 1.5)) { nBeacon++; used(bp.path); }
  }
  out.furniture = nCar + nBench + nPlant + nStop + nUmb + nBeacon;
  const mesh = batch.build('pack city', packMaterial()); if (mesh) { group.add(mesh); out.tris = batch.tris; }
  return out;
}

/** Photoreal textured tier: a few `realistic-city` models as InstancedMeshes with their own KTX2 PBR textures (one draw per material, hard-capped). */
export async function buildRealistic(items: { p: string; x: number; y: number; z: number; rot: number; s: number }[], drawCap = 14): Promise<{ group: THREE.Group; draws: number; paths: Set<string> }> {
  const { packLoader, TJA_URL, usedPaths } = await import('./packLibrary');
  const group = new THREE.Group(); group.name = 'realistic'; const paths = new Set<string>(); let draws = 0;
  const byModel = new Map<string, typeof items>(); for (const it of items) (byModel.get(it.p) ?? byModel.set(it.p, []).get(it.p)!).push(it);
  for (const [path, list] of byModel) {
    try {
      const g = await packLoader().loadAsync(TJA_URL + path); g.scene.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = []; g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      if (draws + meshes.length > drawCap) { meshes.forEach((m) => m.geometry.dispose()); continue; }
      const box = new THREE.Box3().setFromObject(g.scene), ctr = box.getCenter(new THREE.Vector3()), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (const mesh of meshes) {
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).translate(-ctr.x, -box.min.y, -ctr.z);
        const inst = new THREE.InstancedMesh(geo, mesh.material, list.length); inst.name = 'realistic ' + path;
        list.forEach((it, i) => inst.setMatrixAt(i, m4.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromAxisAngle(up, it.rot), new THREE.Vector3(it.s, it.s, it.s))));
        inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); group.add(inst); draws++;
      }
      paths.add(path); usedPaths.add(path);
    } catch (e) { console.warn('[City] realistic model skipped', path, e); }
  }
  releaseTextureSources(group);
  return { group, draws, paths };
}
