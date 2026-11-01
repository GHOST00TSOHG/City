import * as THREE from 'three/webgpu';
import type { Terrain } from './data';
import { DECK_T, type Bridge, type RoadPlan, type ShoreSeg } from './cleanup';
import { Soup } from './geom';

const CONC = new THREE.Color(0x8e8b84), CONC_D = new THREE.Color(0x6f6d68), CAP = new THREE.Color(0xa7a49c), RAIL = new THREE.Color(0x4a4d52);
const UP: [number, number, number] = [0, 1, 0];

function box(s: Soup, cx: number, cz: number, y0: number, y1: number, hx: number, hz: number, ang: number, col: THREE.Color) {
  const c = Math.cos(ang), n = Math.sin(ang), P = (u: number, v: number, y: number) => [cx + c * u - n * v, y, cz + n * u + c * v];
  const k = [P(-hx, -hz, 0), P(hx, -hz, 0), P(hx, hz, 0), P(-hx, hz, 0)];
  for (let i = 0; i < 4; i++) { const a = k[i], b = k[(i + 1) % 4]; s.quad([a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], y1, b[2]], [a[0], y1, a[2]], col, [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz]); }
  s.quad([k[0][0], y1, k[0][2]], [k[1][0], y1, k[1][2]], [k[2][0], y1, k[2][2]], [k[3][0], y1, k[3][2]], col, UP);
}

/** Bridges (slab, parapets, pier bents to the seabed, abutment ramps) and seawalls, in one merged mesh (one draw). */
export function buildWaterfront(bridges: Bridge[], plans: RoadPlan[], walls: ShoreSeg[], t: Terrain, material: THREE.Material) {
  const s = new Soup();
  for (const b of bridges) {
    const p = plans[b.road], y = p.y!; if (!y) continue;
    // first / last index with a deck height (span + ramps)
    let a = b.i0, z = b.i1; while (a > 0 && Number.isFinite(y[a - 1])) a--; while (z < p.pts.length - 1 && Number.isFinite(y[z + 1])) z++;
    const hw = b.hw + 0.35, L: number[][] = [], R: number[][] = [];
    for (let i = a; i <= z; i++) {
      const q = p.pts[i], p0 = p.pts[Math.max(i - 1, 0)], p1 = p.pts[Math.min(i + 1, p.pts.length - 1)], dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      L.push([q[0] + nx * hw, y[i], q[1] + nz * hw]); R.push([q[0] - nx * hw, y[i], q[1] - nz * hw]);
    }
    const bottom = (i: number) => { const span = i + a >= b.i0 && i + a <= b.i1; return span ? y[i + a] - DECK_T : Math.min(y[i + a] - DECK_T, Math.max(t.heightAt(p.pts[i + a][0], p.pts[i + a][1]), 0) - 0.3); };
    for (let i = 0; i + 1 < L.length; i++) {
      const b0 = bottom(i), b1 = bottom(i + 1);
      for (const [E, sg] of [[L, 1], [R, -1]] as [number[][], number][]) {
        const nx = (E[i][0] - (L[i][0] + R[i][0]) / 2) * sg, nz = (E[i][2] - (L[i][2] + R[i][2]) / 2) * sg;
        s.quad([E[i][0], E[i][1] - 0.02, E[i][2]], [E[i + 1][0], E[i + 1][1] - 0.02, E[i + 1][2]], [E[i + 1][0], b1, E[i + 1][2]], [E[i][0], b0, E[i][2]], CONC, [nx * sg, 0, nz * sg]); // fascia
      }
      s.quad([L[i][0], b0, L[i][2]], [L[i + 1][0], b1, L[i + 1][2]], [R[i + 1][0], b1, R[i + 1][2]], [R[i][0], b0, R[i][2]], CONC_D, [0, -1, 0]); // soffit
      // kerb strip beside the asphalt, and a parapet (low wall + rail) once the deck is clear of the ground
      const raised = Math.min(y[i + a], y[i + a + 1]) - Math.max(t.heightAt(p.pts[i + a][0], p.pts[i + a][1]), 0) > 0.5;
      for (const [E, sg] of [[L, 1], [R, -1]] as [number[][], number][]) {
        const cx0 = (L[i][0] + R[i][0]) / 2, cz0 = (L[i][2] + R[i][2]) / 2, cx1 = (L[i + 1][0] + R[i + 1][0]) / 2, cz1 = (L[i + 1][2] + R[i + 1][2]) / 2;
        const ox0 = E[i][0] - (E[i][0] - cx0) * 0.3, oz0 = E[i][2] - (E[i][2] - cz0) * 0.3, ox1 = E[i + 1][0] - (E[i + 1][0] - cx1) * 0.3, oz1 = E[i + 1][2] - (E[i + 1][2] - cz1) * 0.3;
        s.quad([E[i][0], E[i][1] + 0.0, E[i][2]], [E[i + 1][0], E[i + 1][1], E[i + 1][2]], [ox1, E[i + 1][1], oz1], [ox0, E[i][1], oz0], CAP, UP);
        if (!raised) continue;
        const h = 0.95, nx = (E[i][0] - cx0) * sg * sg, nz = (E[i][2] - cz0) * sg * sg;
        s.quad([E[i][0], E[i][1], E[i][2]], [E[i + 1][0], E[i + 1][1], E[i + 1][2]], [E[i + 1][0], E[i + 1][1] + h, E[i + 1][2]], [E[i][0], E[i][1] + h, E[i][2]], CAP, [nx, 0, nz]);
        s.quad([ox0, E[i][1], oz0], [ox1, E[i + 1][1], oz1], [ox1, E[i + 1][1] + h, oz1], [ox0, E[i][1] + h, oz0], CAP, [-nx, 0, -nz]);
        s.quad([E[i][0], E[i][1] + h, E[i][2]], [E[i + 1][0], E[i + 1][1] + h, E[i + 1][2]], [ox1, E[i + 1][1] + h, oz1], [ox0, E[i][1] + h, oz0], RAIL, UP);
      }
    }
    // pier bents: two columns and a cap beam per bent, down to the seabed
    for (const [x, zz, bed] of b.bents) {
      let bi = b.i0, d = Infinity; for (let i = b.i0; i <= b.i1; i++) { const dd = Math.hypot(p.pts[i][0] - x, p.pts[i][1] - zz); if (dd < d) { d = dd; bi = i; } }
      const q0 = p.pts[Math.max(bi - 1, 0)], q1 = p.pts[Math.min(bi + 1, p.pts.length - 1)], ang = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]), nx = -Math.sin(ang), nz = Math.cos(ang);
      const top = y[bi] - DECK_T, wide = b.hw > 2.2, off = Math.max(b.hw - (wide ? 1.1 : 0.25), 0.2), r = wide ? 0.55 : 0.2;
      for (const sg of [-1, 1]) box(s, x + nx * off * sg, zz + nz * off * sg, bed - 0.3, top, r, r, ang, CONC);
      box(s, x, zz, top - 0.55, top, 0.5, b.hw + 0.2, ang, CONC_D);
    }
  }
  // seawalls: concrete face from the seabed up to the quay, with a cap
  for (const w of walls) {
    const top = Math.min(Math.max(w.land * 0.7, 0.5), 1.3), bot = -1.4, T = 0.4;
    const ax = w.x0, az = w.z0, bx = w.x1, bz = w.z1, ix = w.nx * T, iz = w.nz * T;
    s.quad([ax, bot, az], [bx, bot, bz], [bx, top, bz], [ax, top, az], CONC, [-w.nx, 0, -w.nz], [0.6, 0.6, 1, 1]);
    s.quad([ax, top, az], [bx, top, bz], [bx + ix, top, bz + iz], [ax + ix, top, az + iz], CAP, UP);
    s.quad([ax + ix, bot, az + iz], [bx + ix, bot, bz + iz], [bx + ix, top, bz + iz], [ax + ix, top, az + iz], CONC_D, [w.nx, 0, w.nz]);
  }
  const m = new THREE.Mesh(s.geometry(), material); m.name = 'waterfront';
  return m;
}
