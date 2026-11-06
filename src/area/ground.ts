import * as THREE from 'three/webgpu';
import type { AreaData, Terrain } from './data';
import { Soup, ringPts, flatPoly } from './geom';
import { buildPiers } from './piers';
import type { LandmarkPad } from './landmarks';
import { type AreaStyle, styleFor } from './textures';

// Landcover class -> ground texture layer weights [grass, sand, soil, concrete] and a tint (texture colour is kept true).
const CLASS_W: number[][] = [[0.35, 0, 0.65, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0.1, 0.9], [0.75, 0, 0.25, 0], [0.55, 0, 0.45, 0], [1, 0, 0, 0]];
const CLASS_TINT = [1, 1, 1, 1, 0.72, 0.78, 1.08];

// Landcover codes from the bake: land0 grass1 sand2 paved3 wood4 wetland5 pitch6
const COVER = [0x8a8470, 0x5d7444, 0xd8cba4, 0x7c7a74, 0x46603a, 0x5a6646, 0x5a8a44].map((h) => new THREE.Color(h));
const TW = [0, 0, 0, 0];
const SEABED =new THREE.Color(0xb9b08a), DEEP = new THREE.Color(0x2c6a70);

/** Terrain grid as one indexed mesh with per-vertex landcover colour; under-water cells tint toward a sandy-teal seabed. */
export function buildTerrain(t: Terrain, material: THREE.Material, style: AreaStyle = styleFor(''), skip: Rect[] = []) {
  const m = new THREE.Mesh(terrainGeometry(t, style, skip), material); m.name = 'terrain';
  return m;
}
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
/** The terrain mesh geometry (pure THREE geometry, no materials: runs in the geometry worker). */
export function terrainGeometry(t: Terrain, style: AreaStyle, skip: Rect[]) {
  const { nx, nz, cell, x0, z0, h, cover } = t;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), gw = new Float32Array(nx * nz * 4);
  const c = new THREE.Color(), tint = new THREE.Color(style.groundTint);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix, y = h[i];
    pos[i * 3] = x0 + ix * cell; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z0 + iz * cell;
    if (y < 0) c.copy(SEABED).lerp(DEEP, Math.min(1, -y / 2.5));
    else {
      // soften: average landcover colour over the 3x3 neighbourhood so classes blend instead of stepping
      let r = 0, g = 0, b = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const k = cover[jz * nx + jx], cc = COVER[k] ?? COVER[0]; r += cc.r; g += cc.g; b += cc.b; n++;
      }
      c.setRGB(r / n, g / n, b / n);
      if (y < 0.6) c.lerp(COVER[2], 0.25); // beach edge
      // texture weights over the same 3x3 neighbourhood; sand creeps up near the shoreline (more in sandy areas)
      const w = TW; w[0] = w[1] = w[2] = w[3] = 0; let tk = 0, m = 0; // scratch weights, no per-vertex array
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const k = cover[jz * nx + jx], cw = CLASS_W[k] ?? CLASS_W[0]; for (let q = 0; q < 4; q++) w[q] += cw[q]; tk += CLASS_TINT[k] ?? 1; m++;
      }
      const beach = Math.max(0, Math.min(1, (1.2 + style.sandBias * 4 - y) / 1.2)) * (w[3] / m < 0.5 ? 1 : 0);
      for (let q = 0; q < 4; q++) gw[i * 4 + q] = (w[q] / m) * (1 - beach) + (q === 1 ? beach : 0);
      // land: the vertex colour becomes a tint (≈1) over the true texture colour
      const tt = tk / m; c.setRGB(tint.r * tt, tint.g * tt, tint.b * tt);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let k = 0;
  // cells whose centre lies inside a higher-priority tile (skip rects, shrunk 12 m so the two terrains overlap a little instead of cracking) are not drawn
  const skipped = (x: number, z: number) => skip.some((r) => x > r.minX + 12 && x < r.maxX - 12 && z > r.minZ + 12 && z < r.maxZ - 12);
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    if (skip.length && skipped(x0 + (ix + 0.5) * cell, z0 + (iz + 0.5) * cell)) continue;
    const a = iz * nx + ix, b = a + 1, cc = a + nx + 1, d = a + nx;
    idx[k] = a; idx[k + 1] = cc; idx[k + 2] = b; idx[k + 3] = a; idx[k + 4] = d; idx[k + 5] = cc; k += 6; // CCW from above (y up, z south)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(k === idx.length ? idx : idx.slice(0, k), 1));
  g.computeVertexNormals(); g.computeBoundingSphere();
  // compact the per-vertex data: normals Int8 (snorm), texture weights Uint8 (unorm); the colour tint stays Float32 (it can exceed 1)
  const nrm = g.attributes.normal.array as Float32Array, n4 = new Int8Array(nx * nz * 4), w4 = new Uint8Array(nx * nz * 4);
  for (let i = 0; i < nx * nz; i++) {
    for (let q = 0; q < 3; q++) n4[i * 4 + q] = Math.round(nrm[i * 3 + q] * 127);
    for (let q = 0; q < 4; q++) w4[i * 4 + q] = Math.round(Math.min(1, Math.max(0, gw[i * 4 + q])) * 255);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n4, 4, true));
  g.setAttribute('gmat', new THREE.BufferAttribute(w4, 4, true));
  return g;
}

const ROAD = [0x4c4c4e, 0x575758, 0x626262, 0x9a9184].map((h) => new THREE.Color(h));
/** Road surface offsets over the terrain (m). Asphalt layers stay under 0.1 m; majors sit above minors so a crossing covers it (the road material
 *  also has a polygon offset against the terrain). Centre markings 6 mm over their own road. Sidewalks are raised WALK_LIFT over the terrain with a
 *  vertical concrete curb face down to the asphalt edge; they are cut away wherever another street's asphalt (or a junction) crosses them. */
const LIFT = [0.07, 0.062, 0.054, 0.046];

/** Road ribbons with mitred joins and round end caps, draped on the terrain. One mesh. */
const MARK = [new THREE.Color(0xc9a43a), new THREE.Color(0xd8d8d2)]; // c0 centre line yellow, c1 white
const WALK = new THREE.Color(0xa8a49c), CURB = new THREE.Color(0x8d8982), ZEBRA = new THREE.Color(0xe6e6df), WALK_LIFT = 0.14, WALK_W = 1.8;
/** Vertex-colour alpha tags read by roadMat (scene.ts). */
const A_ASPHALT = 255, A_WALK = 200, A_CURB = 150;

/** Road surface height query: spatial hash of road segments, so walkers stand ON the asphalt/sidewalk, not in it.
 *  Segment lift encoding: >= 0.1 sidewalk, < 0 a path (|lift|), else street asphalt / junction disc. Asphalt beats sidewalk (sidewalks are cut away there), sidewalk beats paths. */
export interface RoadSurface { surfaceAt(x: number, z: number): number }

/** Snap every road-mesh vertex onto the height query (after landmark flatten, fixes sparse ribbon gaps / tears). */
export function redrapeRoadGeometry(mesh: THREE.Mesh, surface: RoadSurface) {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) pos.setY(i, surface.surfaceAt(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
}

/** Roads (asphalt by class), centre markings and sidewalks in one draw. Polylines are resampled to the terrain cell so
 *  the ribbon follows the ground instead of cutting through bumps between OSM nodes. Returns the mesh plus a matching height query. */
export function buildRoads(a: AreaData, t: Terrain, material: THREE.Material, landmarkPads: LandmarkPad[] = []): THREE.Mesh & { surface: RoadSurface } {
  void landmarkPads;
  const { s, segs } = roadsSoup(a, t);
  const m = new THREE.Mesh(s.geometry(), material) as THREE.Mesh & { surface: RoadSurface }; m.name = 'roads';
  m.surface = roadSurfaceFrom(segs, t);
  return m;
}

/** Road triangles as a Soup plus the segment list (x0 z0 x1 z1 halfWidth lift per segment) for the height query. Pure: runs in the geometry worker. */
/** Road chunks of ROAD_CHUNK metres. The worker builds one chunk at a time (roads whose bounds touch it, cells whose centre is inside it) and ships it, so the
 *  build's live set and garbage stay small: the page process keeps the worker's high-water heap, which used to be the whole tile's road soup. */
export const ROAD_CHUNK = 1280;
export type Rect4 = [number, number, number, number]; // x0 z0 x1 z1
export function roadChunkRects(a: AreaData, t: Terrain): { key: string; rect: Rect4; roads: AreaData['roads'] }[] {
  const out = new Map<string, { key: string; rect: Rect4; roads: AreaData['roads'] }>(), C = ROAD_CHUNK;
  for (const r of a.roads) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; const pad = r.w / 2 + WALK_W + 1;
    for (let i = 0; i < r.p.length; i += 2) { const x = r.p[i] / 10, z = r.p[i + 1] / 10; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    for (let i = Math.floor((x0 - pad) / C); i <= Math.floor((x1 + pad) / C); i++) for (let j = Math.floor((z0 - pad) / C); j <= Math.floor((z1 + pad) / C); j++) {
      const key = `${i},${j}`; let e = out.get(key); if (!e) out.set(key, (e = { key, rect: [i * C, j * C, (i + 1) * C, (j + 1) * C], roads: [] })); e.roads.push(r);
    }
  }
  void t; return [...out.values()];
}

// ---- junctions: where three or more street arms meet, the asphalt is levelled to one height and covered by one disc ----
interface Arm { c: number; hw: number; dx: number; dz: number; len: number }
interface Junction { x: number; z: number; r: number; J: number; arms: Arm[] }
type Road = AreaData['roads'][number];
const JBLEND = 6; // m over which an arm eases from the junction height to its own lift
function findJunctions(roads: Road[]): Junction[] {
  const nodes = new Map<string, { x: number; z: number; n: number; arms: Arm[] }>();
  for (const r of roads) {
    if (r.c > 2) continue;
    const pts = ringPts(r.p), hw = r.w / 2;
    for (let i = 0; i < pts.length; i++) {
      const key = Math.round(pts[i][0] * 2) + ',' + Math.round(pts[i][1] * 2);
      let nd = nodes.get(key); if (!nd) nodes.set(key, (nd = { x: 0, z: 0, n: 0, arms: [] }));
      nd.x += pts[i][0]; nd.z += pts[i][1]; nd.n++;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= pts.length) continue;
        const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], len = Math.hypot(dx, dz); if (len < 0.5) continue;
        nd.arms.push({ c: r.c, hw, dx: dx / len, dz: dz / len, len });
      }
    }
  }
  const out: Junction[] = [];
  for (const nd of nodes.values()) {
    if (nd.arms.length < 3) continue;
    out.push({ x: nd.x / nd.n, z: nd.z / nd.n, r: Math.max(...nd.arms.map((a) => a.hw)) + 0.3, J: Math.max(...nd.arms.map((a) => LIFT[a.c] ?? 0.05)), arms: nd.arms });
  }
  return out;
}
/** Spatial index (16 m cells) over junctions and over every street segment, for lift blending and sidewalk cutting. */
const GC = 16;
interface Shape { poly: XZ[]; road: Road | null; minX: number; maxX: number; minZ: number; maxZ: number }
function planRoads(roads: Road[]) {
  const junctions = findJunctions(roads);
  const jgrid = new Map<number, Junction[]>(), sgrid = new Map<number, Shape[]>();
  const put = <T,>(g: Map<number, T[]>, x0: number, x1: number, z0: number, z1: number, v: T) => { for (let i = Math.floor(x0 / GC); i <= Math.floor(x1 / GC); i++) for (let j = Math.floor(z0 / GC); j <= Math.floor(z1 / GC); j++) { const k = i * 100003 + j; let l = g.get(k); if (!l) g.set(k, (l = [])); l.push(v); } };
  for (const j of junctions) put(jgrid, j.x - j.r - JBLEND, j.x + j.r + JBLEND, j.z - j.r - JBLEND, j.z + j.r + JBLEND, j);
  const addShape = (poly: XZ[], road: Road | null) => {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]), sh: Shape = { poly, road, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    put(sgrid, sh.minX, sh.maxX, sh.minZ, sh.maxZ, sh);
  };
  for (const r of roads) {
    if (r.c > 2) continue;
    const pts = ringPts(r.p), hw = r.w / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.1) continue;
      const nx = (-dz / L) * hw, nz = (dx / L) * hw;
      addShape([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], r);
    }
  }
  for (const j of junctions) addShape(Array.from({ length: 12 }, (_, i): XZ => [j.x + Math.cos((i / 12) * Math.PI * 2) * j.r * 1.02, j.z + Math.sin((i / 12) * Math.PI * 2) * j.r * 1.02]), null);
  /** Asphalt lift at a point for a road of class c: its own lift, eased up to the junction height near a junction. */
  const liftAt = (c: number, x: number, z: number) => {
    const base = LIFT[c] ?? 0.05; let l = base;
    const g = jgrid.get(Math.floor(x / GC) * 100003 + Math.floor(z / GC));
    if (g) for (const j of g) { const d = Math.hypot(x - j.x, z - j.z); if (d >= j.r + JBLEND) continue; const k = d <= j.r ? 1 : 1 - (d - j.r) / JBLEND, e = k * k * (3 - 2 * k); l = Math.max(l, base + (j.J - base) * e); }
    return l;
  };
  const insideJunction = (x: number, z: number, pad = 0.6) => { const g = jgrid.get(Math.floor(x / GC) * 100003 + Math.floor(z / GC)); if (g) for (const j of g) if (Math.hypot(x - j.x, z - j.z) < j.r + pad) return true; return false; };
  const shapesAt = (x0: number, x1: number, z0: number, z1: number) => {
    const out = new Set<Shape>();
    for (let i = Math.floor(x0 / GC); i <= Math.floor(x1 / GC); i++) for (let j = Math.floor(z0 / GC); j <= Math.floor(z1 / GC); j++) { const l = sgrid.get(i * 100003 + j); if (l) for (const sh of l) if (sh.maxX >= x0 && sh.minX <= x1 && sh.maxZ >= z0 && sh.minZ <= z1) out.add(sh); }
    return out;
  };
  /** Is (x, z) under another street's asphalt (any street but `self`) or inside a junction disc? */
  const covered = (x: number, z: number, self: Road | null) => {
    for (const sh of shapesAt(x, x, z, z)) {
      if (sh.road && sh.road === self) continue;
      if (x < sh.minX || x > sh.maxX || z < sh.minZ || z > sh.maxZ) continue;
      if (inConvex(sh.poly, x, z)) return true;
    }
    return false;
  };
  return { junctions, liftAt, insideJunction, shapesAt, covered };
}
type Plan = ReturnType<typeof planRoads>;
function inConvex(poly: XZ[], x: number, z: number) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c !== 0) { const sg = c > 0 ? 1 : -1; if (sign === 0) sign = sg; else if (sg !== sign) return false; } }
  return true;
}
/** Keeps the part of convex polygon `poly` on the left (keepLeft) or right of the directed line a -> b. */
function halfPlane(poly: XZ[], a: XZ, b: XZ, keepLeft: boolean): XZ[] {
  const sd = (p: XZ) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (keepLeft ? 1 : -1), out: XZ[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = sd(p), sq = sd(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}
/** `poly` minus convex `hole`, as convex pieces (peel the hole off one edge at a time). */
function subtractConvex(poly: XZ[], hole: Shape): XZ[][] {
  const h = hole.poly, area = h.reduce((acc, p, i) => { const q = h[(i + 1) % h.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0), ccw = area > 0;
  const out: XZ[][] = []; let rem = poly;
  for (let i = 0; i < h.length && rem.length >= 3; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const outside = halfPlane(rem, a, b, !ccw); if (outside.length >= 3) out.push(outside);
    rem = halfPlane(rem, a, b, ccw);
  }
  return out;
}

/** Junction centres and crosswalk spots (for street furniture that must line up with the zebra stripes in `roadsSoup`). */
export function junctionSpots(roads: AreaData['roads']) {
  const js = findJunctions(roads), centres = js.map((j) => ({ x: j.x, z: j.z, r: j.r })), beacons: { x: number; z: number; yaw: number; walk: boolean }[] = [];
  for (const j of js) for (const arm of j.arms) {
    if (arm.hw < 2.5 || arm.len < j.r + 4.2) continue;
    const d = j.r + 1.4, px = -arm.dz, pz = arm.dx;
    for (const side of [-1, 1]) beacons.push({ x: j.x + arm.dx * d + px * side * (arm.hw + 0.5), z: j.z + arm.dz * d + pz * side * (arm.hw + 0.5), yaw: Math.atan2(-arm.dx, -arm.dz), walk: arm.hw * 2 >= 5 });
  }
  return { centres, beacons, walkLift: WALK_LIFT };
}
export function roadsSoup(a: AreaData, t: Terrain, rect?: Rect4) {
  const s = new Soup(), segs: number[] = [], plan = planRoads(a.roads);
  const order = [...a.roads].sort((p, q) => q.c - p.c); // paths first, majors last (on top)
  const addSeg = (x0: number, z0: number, x1: number, z1: number, hw: number, lift: number) => { if (!rect) segs.push(x0, z0, x1, z1, hw, lift); };
  const hAt = (x: number, z: number) => Math.max(t.heightAt(x, z), 0.05);
  const inRect = (x: number, z: number) => !rect || (x >= rect[0] && x < rect[2] && z >= rect[1] && z < rect[3]);
  for (const r of order) {
    const w = r.w / 2, col = ROAD[r.c] ?? ROAD[1], base = LIFT[r.c] ?? 0.05;
    const pts = ringPts(r.p); if (pts.length < 2) continue;
    const liftFn = (x: number, z: number) => plan.liftAt(r.c, x, z);
    // every layer is cut along the terrain triangles under it, so its vertices lie exactly on the rendered ground + a lift
    const layer = (c: THREE.Color, lf: number | ((x: number, z: number) => number), alpha = A_ASPHALT): Tri => (p, q, d) => { s.alpha = alpha; drapedTri(s, t, p, q, d, c, lf, rect); s.alpha = A_ASPHALT; };
    if (r.c <= 2 && r.w >= 5) { // raised sidewalks with curb faces, cut away where another street or a junction crosses
      const walk = layer(WALK, WALK_LIFT, A_WALK);
      const cut: Tri = (p, q, d) => {
        const x0 = Math.min(p[0], q[0], d[0]), x1 = Math.max(p[0], q[0], d[0]), z0 = Math.min(p[1], q[1], d[1]), z1 = Math.max(p[1], q[1], d[1]);
        let pieces: XZ[][] = [[p, q, d]];
        for (const sh of plan.shapesAt(x0, x1, z0, z1)) {
          if (sh.road === r || sh.maxX < x0 || sh.minX > x1 || sh.maxZ < z0 || sh.minZ > z1) continue;
          pieces = pieces.flatMap((pc) => subtractConvex(pc, sh));
          if (!pieces.length) return;
        }
        for (const pc of pieces) for (let k = 1; k + 1 < pc.length; k++) walk(pc[0], pc[k], pc[k + 1]);
      };
      const face = (e0: XZ, e1: XZ, outer: boolean) => { // vertical concrete face along one ribbon edge, in <= 1.5 m pieces, skipped where a crossing street covers it
        const L = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), n = Math.max(1, Math.ceil(L / 1.5));
        for (let k = 0; k < n; k++) {
          const u0 = k / n, u1 = (k + 1) / n, ax = e0[0] + (e1[0] - e0[0]) * u0, az = e0[1] + (e1[1] - e0[1]) * u0, bx = e0[0] + (e1[0] - e0[0]) * u1, bz = e0[1] + (e1[1] - e0[1]) * u1;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (!inRect(mx, mz) || plan.covered(mx, mz, r)) continue;
          const yb = (x: number, z: number) => hAt(x, z) + (outer ? 0 : plan.liftAt(r.c, x, z)), yt = (x: number, z: number) => hAt(x, z) + WALK_LIFT;
          s.alpha = A_CURB;
          s.quad([ax, yb(ax, az), az], [bx, yb(bx, bz), bz], [bx, yt(bx, bz), bz], [ax, yt(ax, az), az], CURB, hintOf(e0, e1, pts, outer));
          s.alpha = A_ASPHALT;
        }
      };
      ribbon(pts, w + WALK_W, cut, w, face);
      for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w + WALK_W, WALK_LIFT);
    }
    ribbon(pts, w, layer(col, liftFn));
    for (const e of [pts[0], pts[pts.length - 1]]) disc(layer(col, (x, z) => liftFn(x, z) - 0.005), e[0], e[1], w);
    for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, r.c > 2 ? -base : base);
    if (r.c <= 1 && r.w >= 6) dashes(pts, layer(MARK[r.c], (x, z) => liftFn(x, z) + 0.006), r.c === 0 ? 0 : 1, (x, z) => plan.insideJunction(x, z));
  }
  // junction discs: one flat, uniform patch of asphalt over each crossing (hides the overlap seams and the arms' centre markings)
  for (const j of plan.junctions) {
    const col = ROAD[Math.min(...j.arms.map((q) => q.c))] ?? ROAD[1];
    s.alpha = A_ASPHALT; disc((p, q, d) => drapedTri(s, t, p, q, d, col, j.J + 0.004, rect), j.x, j.z, j.r);
    addSeg(j.x, j.z, j.x, j.z, j.r, j.J + 0.004);
    // zebra crossings across each wide-enough arm, just outside the junction
    for (const arm of j.arms) {
      if (arm.hw < 2.5 || arm.len < j.r + 4.2) continue;
      const d0 = j.r + 0.9, d1 = d0 + 2.6, px = -arm.dz, pz = arm.dx;
      for (let u = -(arm.hw - 0.7); u <= arm.hw - 0.7 + 1e-6; u += 1.0) {
        const q = (d: number, lat: number): XZ => [j.x + arm.dx * d + px * lat, j.z + arm.dz * d + pz * lat];
        const f = (x: number, z: number) => plan.liftAt(arm.c, x, z) + 0.008;
        const tri: Tri = (p, q2, d) => { s.alpha = A_ASPHALT; drapedTri(s, t, p, q2, d, ZEBRA, f, rect); };
        tri(q(d0, u - 0.25), q(d1, u - 0.25), q(d1, u + 0.25)); tri(q(d0, u - 0.25), q(d1, u + 0.25), q(d0, u + 0.25));
      }
    }
  }
  return { s, segs };
}

/** Outward hint for a curb face along edge e0 -> e1: toward the street for the inner face, away from it for the outer one. */
function hintOf(e0: XZ, e1: XZ, pts: XZ[], outer: boolean): [number, number, number] {
  const mx = (e0[0] + e1[0]) / 2, mz = (e0[1] + e1[1]) / 2; let best = Infinity, cx = mx, cz = mz;
  for (let i = 0; i + 1 < pts.length; i++) { // nearest point on the centre line
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, L2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((mx - ax) * dx + (mz - az) * dz) / L2));
    const px = ax + dx * u, pz = az + dz * u, d = (px - mx) ** 2 + (pz - mz) ** 2; if (d < best) { best = d; cx = px; cz = pz; }
  }
  const hx = outer ? mx - cx : cx - mx, hz = outer ? mz - cz : cz - mz, l = Math.hypot(hx, hz) || 1;
  return [hx / l, 0, hz / l];
}

/** The segment list `roadsSoup` produces (x0 z0 x1 z1 halfWidth lift), without any triangles: the road height query needs only this. */
export function roadSegments(a: AreaData): number[] {
  const segs: number[] = [], order = [...a.roads].sort((p, q) => q.c - p.c), plan = planRoads(a.roads);
  for (const r of order) {
    const w = r.w / 2, lift = LIFT[r.c] ?? 0.05, pts = ringPts(r.p); if (pts.length < 2) continue;
    if (r.c <= 2 && r.w >= 5) for (let i = 0; i < pts.length - 1; i++) segs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w + WALK_W, WALK_LIFT);
    for (let i = 0; i < pts.length - 1; i++) segs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, r.c > 2 ? -lift : lift);
  }
  for (const j of plan.junctions) segs.push(j.x, j.z, j.x, j.z, j.r, j.J + 0.004);
  return segs;
}

/** Height query over road segments (spatial hash), built from the `roadsSoup` segment list. */
export function roadSurfaceFrom(segs: ArrayLike<number>, t: { heightAt(x: number, z: number): number }): RoadSurface {
  const B = 32, hash = new Map<number, number[]>();
  for (let id = 0; id < segs.length / 6; id++) {
    const o = id * 6, x0 = segs[o], z0 = segs[o + 1], x1 = segs[o + 2], z1 = segs[o + 3], hw = segs[o + 4];
    const ax = Math.floor((Math.min(x0, x1) - hw) / B), bx = Math.floor((Math.max(x0, x1) + hw) / B), az = Math.floor((Math.min(z0, z1) - hw) / B), bz = Math.floor((Math.max(z0, z1) + hw) / B);
    for (let i = ax; i <= bx; i++) for (let j = az; j <= bz; j++) { const k = i * 100003 + j; let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(id); }
  }
  return {
    surfaceAt(x, z) {
      const l = hash.get(Math.floor(x / B) * 100003 + Math.floor(z / B)); let street = -1, walk = -1, path = -1;
      if (l) for (const id of l) {
        const o = id * 6, x0 = segs[o], z0 = segs[o + 1], dx = segs[o + 2] - x0, dz = segs[o + 3] - z0, hw = segs[o + 4], lf = segs[o + 5];
        const L2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2));
        const ex = x0 + dx * u - x, ez = z0 + dz * u - z;
        if (ex * ex + ez * ez > hw * hw) continue;
        if (lf < 0) path = Math.max(path, -lf); else if (lf >= 0.1) walk = Math.max(walk, lf); else street = Math.max(street, lf);
      }
      const h = t.heightAt(x, z), best = street >= 0 ? street : walk >= 0 ? walk : path;
      return best < 0 ? h : Math.max(h, 0.05) + best;
    },
  };
}

type XZ = [number, number];
type Tri = (a: XZ, b: XZ, c: XZ) => void;

/** Sutherland-Hodgman: polygon `subject` clipped to the convex polygon `clipper` (any winding). */
function clipConvex(subject: XZ[], clipper: XZ[]): XZ[] {
  const ccw = (clipper[1][0] - clipper[0][0]) * (clipper[2][1] - clipper[0][1]) - (clipper[1][1] - clipper[0][1]) * (clipper[2][0] - clipper[0][0]) > 0;
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length], inp = out; out = [];
    const side = (p: XZ) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (ccw ? 1 : -1);
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
    }
  }
  return out;
}

/** Adds the plan triangle (a, b, c) cut along every terrain triangle under it (same split as the ground mesh: diagonal A-C), each piece lifted
 *  by `lift` over its terrain plane, so the surface follows the rendered ground exactly (zero deviation) with no resampling. Heights are
 *  kept at or above `minY` (the sea plane). */
function drapedTri(s: Soup, t: Terrain, a: XZ, b: XZ, c: XZ, col: THREE.Color, lift: number | ((x: number, z: number) => number), rect?: Rect4, minY = 0.05) {
  const liftOf = typeof lift === 'number' ? () => lift : lift;
  const { nx, nz, cell, x0, z0, h } = t;
  const ix0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / cell)), ix1 = Math.min(nx - 2, Math.floor((Math.max(a[0], b[0], c[0]) - x0) / cell));
  const iz0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - z0) / cell)), iz1 = Math.min(nz - 2, Math.floor((Math.max(a[1], b[1], c[1]) - z0) / cell));
  const subject: XZ[] = [a, b, c];
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const X0 = x0 + ix * cell, X1 = X0 + cell, Z0 = z0 + iz * cell, Z1 = Z0 + cell;
    if (rect) { const mx = X0 + cell / 2, mz = Z0 + cell / 2; if (mx < rect[0] || mx >= rect[2] || mz < rect[1] || mz >= rect[3]) continue; } // this cell belongs to another chunk
    const i = iz * nx + ix, hA = h[i], hB = h[i + 1], hC = h[i + nx + 1], hD = h[i + nx];
    for (let k = 0; k < 2; k++) {
      const piece = clipConvex(subject, k === 0 ? [[X0, Z0], [X1, Z0], [X1, Z1]] : [[X0, Z0], [X1, Z1], [X0, Z1]]);
      if (piece.length < 3) continue;
      // plane height of this terrain triangle; the part below the sea plane (minY) is flat at minY, split exactly along the shoreline contour
      const plane = (x: number, z: number) => { const tx = (x - X0) / cell, tz = (z - Z0) / cell; return k === 0 ? hA + (hB - hA) * tx + (hC - hB) * tz : hA + (hC - hD) * tx + (hD - hA) * tz; };
      const g = piece.map(([x, z]) => plane(x, z) - minY);
      const emit = (poly: XZ[], flat: boolean) => {
        if (poly.length < 3) return;
        const P = poly.map(([x, z]) => [x, (flat ? minY : plane(x, z)) + liftOf(x, z), z]);
        for (let j = 1; j < P.length - 1; j++) s.tri(P[0], P[j], P[j + 1], col, [0, 1, 0]);
      };
      if (g.every((v) => v >= -1e-9)) emit(piece, false);
      else if (g.every((v) => v <= 1e-9)) emit(piece, true);
      else { emit(clipHalf(piece, g, 1), false); emit(clipHalf(piece, g, -1), true); }
    }
  }
}

/** Part of convex polygon `poly` where sign * g >= 0 (g = values at its vertices, linear along edges). */
function clipHalf(poly: XZ[], g: number[], sign: number): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, p = poly[i], q = poly[j], gp = g[i] * sign, gq = g[j] * sign;
    if (gp >= 0) out.push(p);
    if ((gp >= 0) !== (gq >= 0)) { const k = gp / (gp - gq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}


/** Centre-line markings: 3 m dashes every 9 m (kind 1) or a solid double line (kind 0), 0.12 m wide. */
function dashes(pts: XZ[], tri: Tri, kind: number, skip?: (x: number, z: number) => boolean) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) continue;
    const nx = -dz / L * 0.06, nz = dx / L * 0.06;
    const strip = (u0: number, u1: number, off: number) => {
      if (skip && skip(a[0] + dx * (u0 + u1) / 2, a[1] + dz * (u0 + u1) / 2)) return;
      const p0 = [a[0] + dx * u0 + nx * off * 2, a[1] + dz * u0 + nz * off * 2], p1 = [a[0] + dx * u1 + nx * off * 2, a[1] + dz * u1 + nz * off * 2];
      const q = (p: number[], sgn: number): XZ => [p[0] + nx * sgn, p[1] + nz * sgn];
      tri(q(p0, 1), q(p1, 1), q(p1, -1)); tri(q(p0, 1), q(p1, -1), q(p0, -1));
    };
    if (kind === 0) { strip(0, 1, 1.4); strip(0, 1, -1.4); }
    else for (let d = Math.ceil(acc / 9) * 9 - acc; d < L; d += 9) strip(d / L, Math.min(d + 3, L) / L, 0);
    acc += L;
  }
}

/** Ribbon of half-width `w` along `pts` with mitred joins (miter clamped at 2x) and a round disc at sharp bends. With `inner` > 0 only the two
 *  side bands between `inner` and `w` are made (sidewalks: the road covers the middle, so this saves a third of the triangles). */
function ribbon(pts: XZ[], w: number, tri: Tri, inner = 0, face?: (a: XZ, b: XZ, outer: boolean) => void) {
  const L: XZ[] = [], R: XZ[] = [], Li: XZ[] = [], Ri: XZ[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let n1x = 0, n1z = 0, n2x = 0, n2z = 0;
    if (i > 0) { const dx = p[0] - a[0], dz = p[1] - a[1], l = Math.hypot(dx, dz) || 1; n1x = -dz / l; n1z = dx / l; }
    if (i < pts.length - 1) { const dx = b[0] - p[0], dz = b[1] - p[1], l = Math.hypot(dx, dz) || 1; n2x = -dz / l; n2z = dx / l; }
    if (i === 0) { n1x = n2x; n1z = n2z; } if (i === pts.length - 1) { n2x = n1x; n2z = n1z; }
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const cos = Math.max(mx * n1x + mz * n1z, 0.5); // clamp miter at 2x
    const k = w / cos, ki = inner / cos;
    L.push([p[0] + mx * k, p[1] + mz * k]); R.push([p[0] - mx * k, p[1] - mz * k]);
    if (inner > 0) { Li.push([p[0] + mx * ki, p[1] + mz * ki]); Ri.push([p[0] - mx * ki, p[1] - mz * ki]); }
    if (i > 0 && cos < 0.92 && !(inner > 0)) disc(tri, p[0], p[1], w); // round sharp bends (sidewalk bands have no disc: it would cover the road)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (inner > 0) { tri(Li[i], L[i], L[i + 1]); tri(Li[i], L[i + 1], Li[i + 1]); tri(Ri[i], R[i], R[i + 1]); tri(Ri[i], R[i + 1], Ri[i + 1]); }
    else { tri(L[i], R[i], R[i + 1]); tri(L[i], R[i + 1], L[i + 1]); }
    if (face && inner > 0) { face(Li[i], Li[i + 1], false); face(Ri[i], Ri[i + 1], false); face(L[i], L[i + 1], true); face(R[i], R[i + 1], true); }
  }
}

function disc(tri: Tri, x: number, z: number, r: number) {
  const n = 12, c: XZ = [x, z], pt = (a: number, k: number): XZ => [x + Math.cos(a) * r * k, z + Math.sin(a) * r * k];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    if (r < 2) { tri(c, pt(a0, 1), pt(a1, 1)); continue; }
    tri(c, pt(a0, 0.5), pt(a1, 0.5)); tri(pt(a0, 0.5), pt(a1, 0.5), pt(a1, 1)); tri(pt(a0, 0.5), pt(a1, 1), pt(a0, 1));
  }
}

/** Pools (lit-turquoise water with a concrete coping) and boat docks / piers on pilings (piers.ts). */
export function buildPoolsPiers(a: AreaData, t: Terrain, material: THREE.Material) {
  const s = new Soup();
  const water = new THREE.Color(0x2fa8b8), coping = new THREE.Color(0xc9c4b8);
  for (const p of a.pools) {
    const pts = ringPts(p); if (pts.length < 3) continue;
    let y = Infinity; for (const [x, z] of pts) y = Math.min(y, t.heightAt(x, z)); y = Math.max(y, 0.2) + 0.12;
    flatPoly(s, pts, [], y + 0.02, coping);
    const cx = pts.reduce((q, v) => q + v[0], 0) / pts.length, cz = pts.reduce((q, v) => q + v[1], 0) / pts.length;
    flatPoly(s, pts.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1, k = Math.max(0, l - 0.35) / l; return [cx + dx * k, cz + dz * k] as [number, number]; }), [], y + 0.04, water);
  }
  buildPiers(s, a.piers, t);
  const m = new THREE.Mesh(s.geometry(), material); m.name = 'pools+piers';
  return m;
}
