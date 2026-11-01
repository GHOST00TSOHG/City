import * as THREE from 'three/webgpu';
import type { AreaData, Terrain } from './data';
import { Soup, ringPts, flatPoly } from './geom';
import { type AreaStyle, styleFor } from './textures';
import type { RoadPlan } from './cleanup';


// Landcover class -> ground texture layer weights [grass, sand, soil, concrete] and a tint (texture colour is kept true).
const CLASS_W: number[][] = [[0.35, 0, 0.65, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0.1, 0.9], [0.75, 0, 0.25, 0], [0.55, 0, 0.45, 0], [1, 0, 0, 0]];
const CLASS_TINT = [1, 1, 1, 1, 0.72, 0.78, 1.08];

// Landcover codes from the bake: land0 grass1 sand2 paved3 wood4 wetland5 pitch6
const COVER = [0x8a8470, 0x5d7444, 0xd8cba4, 0x7c7a74, 0x46603a, 0x5a6646, 0x5a8a44].map((h) => new THREE.Color(h));
const SEABED = new THREE.Color(0xb9b08a), DEEP = new THREE.Color(0x2c6a70);

/** Terrain grid as one indexed mesh with per-vertex landcover colour; under-water cells tint toward a sandy-teal seabed. */
export function buildTerrain(t: Terrain, material: THREE.Material, style: AreaStyle = styleFor('')) {
  const { nx, nz, cell, x0, z0, h, cover } = t;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), gw = new Float32Array(nx * nz * 4);
  const c = new THREE.Color(), tint = new THREE.Color(style.groundTint);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix, y = h[i];
    pos.set([x0 + ix * cell, y, z0 + iz * cell], i * 3);
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
      const w = [0, 0, 0, 0]; let tk = 0, m = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const k = cover[jz * nx + jx], cw = CLASS_W[k] ?? CLASS_W[0]; for (let q = 0; q < 4; q++) w[q] += cw[q]; tk += CLASS_TINT[k] ?? 1; m++;
      }
      const beach = Math.max(0, Math.min(1, (1.2 + style.sandBias * 4 - y) / 1.2)) * (w[3] / m < 0.5 ? 1 : 0);
      for (let q = 0; q < 4; q++) gw[i * 4 + q] = (w[q] / m) * (1 - beach) + (q === 1 ? beach : 0);
      // land: the vertex colour becomes a tint (≈1) over the true texture colour
      const tt = tk / m; c.setRGB(tint.r * tt, tint.g * tt, tint.b * tt);
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const a = iz * nx + ix, b = a + 1, cc = a + nx + 1, d = a + nx;
    idx.set([a, cc, b, a, d, cc], k); k += 6; // CCW from above (y up, z south)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('gmat', new THREE.BufferAttribute(gw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material); m.name = 'terrain';
  return m;
}

const ROAD = [0x4c4c4e, 0x575758, 0x626262, 0x9a9184].map((h) => new THREE.Color(h));
const LIFT = [0.16, 0.13, 0.1, 0.07];

/** Road ribbons with mitred joins and round end caps, draped on the terrain. One mesh. */
const MARK = [new THREE.Color(0xc9a43a), new THREE.Color(0xd8d8d2)]; // c0 centre line yellow, c1 white
const WALK = new THREE.Color(0xa8a49c), WALK_LIFT = 0.05, WALK_W = 1.8;

/** Road surface height query: spatial hash of road segments, so walkers stand ON the asphalt/sidewalk, not in it. */
export interface RoadSurface { surfaceAt(x: number, z: number): number }

/** Roads (asphalt by class), centre markings and sidewalks in one draw. Polylines are resampled to the terrain cell so
 *  the ribbon follows the ground instead of cutting through bumps between OSM nodes. Sidewalks sit below every road lift so
 *  any crossing road covers them; markings sit just above their own road. Returns the mesh plus a matching height query. */
export function buildRoads(a: AreaData, t: Terrain, material: THREE.Material, plans?: RoadPlan[]): THREE.Mesh & { surface: RoadSurface } {
  const s = new Soup();
  const order = a.roads.map((r, i) => ({ r, i })).sort((p, q) => q.r.c - p.r.c); // paths first, majors last (on top)
  const step = Math.max(2, t.cell);
  const base = (x: number, z: number) => Math.max(t.heightAt(x, z), 0.05);
  const B = 32, hash = new Map<number, number[]>(), segs: number[] = []; // seg: x0 z0 x1 z1 halfWidth lift y0 y1 (y: absolute deck height on bridges / ramps, else NaN)
  const addSeg = (x0: number, z0: number, x1: number, z1: number, hw: number, lift: number, y0 = NaN, y1 = NaN) => {
    const id = segs.length / 8; segs.push(x0, z0, x1, z1, hw, lift, y0, y1);
    const ax = Math.floor((Math.min(x0, x1) - hw) / B), bx = Math.floor((Math.max(x0, x1) + hw) / B), az = Math.floor((Math.min(z0, z1) - hw) / B), bz = Math.floor((Math.max(z0, z1) + hw) / B);
    for (let i = ax; i <= bx; i++) for (let j = az; j <= bz; j++) { const k = i * 100003 + j; let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(id); }
  };
  for (const { r, i: ri } of order) {
    const plan = plans?.[ri], pts = plan?.pts ?? resample(ringPts(r.p), step); if (pts.length < 2) continue;
    const yc = plan?.y ?? undefined; // bridge / ramp centre-line heights (NaN elsewhere)
    const w = r.w / 2, col = ROAD[r.c] ?? ROAD[1], lift = LIFT[r.c] ?? 0.1;
    const Y = (x: number, z: number) => base(x, z) + lift;
    const ycAt = (i: number, d: number) => (yc && Number.isFinite(yc[i]) ? yc[i] - d : NaN);
    if (r.c <= 2 && r.w >= 5) { // sidewalks
      const Yw = (x: number, z: number) => base(x, z) + WALK_LIFT;
      ribbon(s, pts, w + WALK_W, WALK, Yw, yc?.map((v) => v - lift + WALK_LIFT));
      for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w + WALK_W, WALK_LIFT, ycAt(i, lift - WALK_LIFT), ycAt(i + 1, lift - WALK_LIFT));
    }
    ribbon(s, pts, w, col, Y, yc);
    for (const [e, k] of [[pts[0], 0], [pts[pts.length - 1], pts.length - 1]] as [[number, number], number][]) disc(s, e[0], e[1], w, col, Number.isFinite(yc?.[k] ?? NaN) ? () => yc![k] : Y);
    for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, lift, ycAt(i, 0), ycAt(i + 1, 0));
    if (r.c <= 1 && r.w >= 6) dashes(s, pts, MARK[r.c], (x, z) => Y(x, z) + 0.012, r.c === 0 ? 0 : 1, yc);
  }
  const m = new THREE.Mesh(s.geometry(), material) as THREE.Mesh & { surface: RoadSurface }; m.name = 'roads';
  m.surface = {
    surfaceAt(x, z) {
      const l = hash.get(Math.floor(x / B) * 100003 + Math.floor(z / B)); let best = -Infinity;
      const h = Math.max(t.heightAt(x, z), 0.05);
      if (l) for (const id of l) {
        const o = id * 8, x0 = segs[o], z0 = segs[o + 1], dx = segs[o + 2] - x0, dz = segs[o + 3] - z0, hw = segs[o + 4];
        const L2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2));
        const ex = x0 + dx * u - x, ez = z0 + dz * u - z;
        if (ex * ex + ez * ez > hw * hw) continue;
        const ya = segs[o + 6], yb = segs[o + 7], v = Number.isFinite(ya) && Number.isFinite(yb) ? ya + (yb - ya) * u : h + segs[o + 5];
        if (v > best) best = v;
      }
      return best === -Infinity ? t.heightAt(x, z) : best;
    },
  };
  return m;
}

/** Split long polyline segments so no piece is longer than `step` metres. */
function resample(pts: [number, number][], step: number) {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step); for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    out.push(pts[i]);
  }
  return out;
}

/** Centre-line markings: 3 m dashes every 9 m (kind 1) or a solid double line (kind 0), 0.12 m wide. */
function dashes(s: Soup, pts: [number, number][], col: THREE.Color, Y: (x: number, z: number) => number, kind: number, yc?: number[]) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) continue;
    const nx = -dz / L * 0.06, nz = dx / L * 0.06;
    const strip = (u0: number, u1: number, off: number) => {
      const p0 = [a[0] + dx * u0 + nx * off * 2, a[1] + dz * u0 + nz * off * 2], p1 = [a[0] + dx * u1 + nx * off * 2, a[1] + dz * u1 + nz * off * 2];
      const ua = yc && Number.isFinite(yc[i]) && Number.isFinite(yc[i + 1]);
      const q = (p: number[], sgn: number) => [p[0] + nx * sgn, ua ? yc![i] + (yc![i + 1] - yc![i]) * (Math.hypot(p[0] - a[0], p[1] - a[1]) / L) + 0.012 : Y(p[0], p[1]), p[1] + nz * sgn];
      s.quad(q(p0, 1), q(p1, 1), q(p1, -1), q(p0, -1), col, [0, 1, 0]);
    };
    if (kind === 0) { strip(0, 1, 1.4); strip(0, 1, -1.4); }
    else for (let d = Math.ceil(acc / 9) * 9 - acc; d < L; d += 9) strip(d / L, Math.min(d + 3, L) / L, 0);
    acc += L;
  }
}

function ribbon(s: Soup, pts: [number, number][], w: number, col: THREE.Color, Y: (x: number, z: number) => number, yc?: number[]) {
  const L: number[][] = [], R: number[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let n1x = 0, n1z = 0, n2x = 0, n2z = 0;
    if (i > 0) { const dx = p[0] - a[0], dz = p[1] - a[1], l = Math.hypot(dx, dz) || 1; n1x = -dz / l; n1z = dx / l; }
    if (i < pts.length - 1) { const dx = b[0] - p[0], dz = b[1] - p[1], l = Math.hypot(dx, dz) || 1; n2x = -dz / l; n2z = dx / l; }
    if (i === 0) { n1x = n2x; n1z = n2z; } if (i === pts.length - 1) { n2x = n1x; n2z = n1z; }
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const cos = Math.max(mx * n1x + mz * n1z, 0.5); // clamp miter at 2x
    const k = w / cos;
    L.push([p[0] + mx * k, 0, p[1] + mz * k]); R.push([p[0] - mx * k, 0, p[1] - mz * k]);
    if (i > 0 && cos < 0.92) disc(s, p[0], p[1], w, col, yc && Number.isFinite(yc[i]) ? () => yc[i] : Y); // round sharp bends
  }
  for (let i = 0; i < pts.length; i++) { const k = yc && Number.isFinite(yc[i]) ? yc[i] : NaN; L[i][1] = Number.isNaN(k) ? Y(L[i][0], L[i][2]) : k; R[i][1] = Number.isNaN(k) ? Y(R[i][0], R[i][2]) : k; }
  for (let i = 0; i < pts.length - 1; i++) s.quad(L[i], L[i + 1], R[i + 1], R[i], col, [0, 1, 0]);
}

function disc(s: Soup, x: number, z: number, r: number, col: THREE.Color, Y: (x: number, z: number) => number) {
  const n = 10, y = Y(x, z) - 0.005, c = [x, y, z];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    s.tri(c, [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], col, [0, 1, 0]);
  }
}

/** Pools: lit-turquoise water with a concrete coping, on a retaining skirt so a pool on a slope stays level (docks live in docks.ts). */
export function buildPools(a: AreaData, t: Terrain, material: THREE.Material) {
  const s = new Soup();
  const water = new THREE.Color(0x2fa8b8), coping = new THREE.Color(0xc9c4b8), skirt = new THREE.Color(0xa8a49a);
  for (const p of a.pools) {
    const pts = ringPts(p); if (pts.length < 3) continue;
    let lo = Infinity, hi = -Infinity; for (const [x, z] of pts) { const h = t.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const y = Math.max(hi, 0.2) + 0.12; // surface is level at the high side; the skirt closes the low side
    flatPoly(s, pts, [], y + 0.02, coping);
    if (y - lo > 0.2) for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]; sideQuad(s, x0, z0, x1, z1, y + 0.02, skirt, Math.min(lo, 0.2) - 0.3); }
    const cx = pts.reduce((q, v) => q + v[0], 0) / pts.length, cz = pts.reduce((q, v) => q + v[1], 0) / pts.length;
    flatPoly(s, pts.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1, k = Math.max(0, l - 0.35) / l; return [cx + dx * k, cz + dz * k] as [number, number]; }), [], y + 0.04, water);
  }
  const m = new THREE.Mesh(s.geometry(), material); m.name = 'pools';
  return m;
}
function sideQuad(s: Soup, x0: number, z0: number, x1: number, z1: number, top: number, col: THREE.Color, bottom = -0.6) {
  const a = [x0, top, z0], b = [x1, top, z1], c = [x1, bottom, z1], d = [x0, bottom, z0];
  s.quad(a, b, c, d, col); s.quad(a, d, c, b, col); // both sides, cheap
}
