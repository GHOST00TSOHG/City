import * as THREE from 'three/webgpu';
import type { Building, Terrain } from './data';
import { Soup, ringPts, signedArea, flatPoly } from './geom';
import { type AreaStyle, styleFor, pick, WALL, ROOF, SHINGLE } from './textures';

const CHUNK = 600; // m — one merged mesh per chunk keeps draw calls low and still frustum-culls
const UP: [number, number, number] = [0, 1, 0];

/** Solid, clean building shells from baked footprints: walls + roof (flat / gabled / hipped / pyramidal / skillion). */
export function buildBuildings(list: Building[], terrain: Terrain, material: THREE.Material, style: AreaStyle = styleFor('')) {
  const chunks = new Map<string, Soup>();
  const wall = new THREE.Color(), roof = new THREE.Color(), trim = new THREE.Color();
  let count = 0;
  for (const b of list) {
    const rings = b.r.map(ringPts).filter((r) => r.length >= 3);
    if (!rings.length) continue;
    const outer = rings[0], [cx, cz] = [b.o[0] / 10, b.o[1] / 10];
    const key = `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
    let s = chunks.get(key); if (!s) { chunks.set(key, (s = new Soup())); s.f = []; }
    // Painting: pick a wall material per building from the area style (bake colour hints brick), then a paint colour.
    const seed0 = ((b.o[0] * 73856093) ^ (b.o[1] * 19349663)) >>> 0, h1 = (seed0 % 1009) / 1009, h2 = ((seed0 >>> 10) % 997) / 997, h3 = ((seed0 >>> 20) % 991) / 991;
    wall.setHex(b.wc); const hsl = { h: 0, s: 0, l: 0 }; wall.getHSL(hsl);
    const brickHint = hsl.h < 0.06 && hsl.s > 0.25 && hsl.l < 0.5;
    const small = (b.s !== 'flat' && b.rh > 0.2) || b.h < 7.5;
    const wm = brickHint && style.house[WALL.brick] + style.big[WALL.brick] > 0.1 ? WALL.brick : pick(small ? style.house : style.big, h1);
    const pitchedR = b.s !== 'flat' && b.rh > 0.2;
    const rm = pitchedR ? pick(style.roofPitched, h3) : ROOF.gravel;
    if (wm === WALL.brick || wm === WALL.concrete) wall.setRGB(1, 1, 1).multiplyScalar(0.92 + h2 * 0.16); // real material colour, slight variation
    else wall.setHex(style.paints[Math.floor(h2 * style.paints.length) % style.paints.length]).lerp(new THREE.Color(b.wc), 0.25);
    if (rm === ROOF.shingle) roof.setHex(SHINGLE[((seed0 >>> 5) % SHINGLE.length)]).multiplyScalar(0.85 + h2 * 0.3);
    else roof.setRGB(1, 1, 1).multiplyScalar(0.85 + h3 * 0.3); trim.copy(wall).multiplyScalar(0.82);
    const pack = wm * 4 + rm * 32;
    let gmin = Infinity; for (const [x, z] of outer) gmin = Math.min(gmin, terrain.heightAt(x, z));
    gmin = b.pad ?? Math.max(gmin, 0.2); // clean-up sets the floor level (pad) and a foundation (fy) down to the lowest ground
    const base = b.m > 0 ? gmin + b.m : (b.fy ?? gmin - 0.4);
    const top = gmin + b.h;
    const pitched = b.s !== 'flat' && b.rh > 0.2;
    const eave = pitched ? top - b.rh : top;
    // Facade kind (inferred): 1 = house (small, pitched, low), 2 = commercial/apartment; parts floating above ground get none.
    const area = Math.abs(signedArea(outer));
    const kind = b.m > 2 ? 0 : (pitched || b.h < 7.5) && area < 400 ? 1 : 2;
    const seed = ((b.o[0] * 73856093) ^ (b.o[1] * 19349663)) >>> 0;
    s.cur = [base, eave, kind + pack, (seed % 997) / 997];
    // Walls: darker at the foot (cheap contact shading), lighter under the eave.
    for (const ring of rings) {
      const sign = signedArea(ring) > 0 ? 1 : -1;
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const nrm: [number, number, number] = [(dz / L) * sign, 0, (-dx / L) * sign];
        const foot = b.m > 0 ? 0.9 : 0.62;
        s.quad([x0, base, z0], [x1, base, z1], [x1, eave, z1], [x0, eave, z0], wall, nrm, [foot, foot, 1, 1]);
      }
    }
    s.cur = [base, eave, pack, 0]; // roofs, gables, soffits: no windows
    if (!pitched) {
      flatPoly(s, outer, rings.slice(1), top, roof);
      // Parapet lip on larger flat roofs reads as a real roof edge instead of a cut box.
      if (Math.abs(signedArea(outer)) > 120 && b.h > 5) parapet(s, outer, top, trim);
    } else roofShape(s, b, eave, roof, wall);
    if (b.m > 0) flatPoly(s, outer, rings.slice(1), base, trim, true);
    count++;
  }
  const group = new THREE.Group(); group.name = 'buildings';
  for (const [key, s] of chunks) {
    if (s.empty) continue;
    const m = new THREE.Mesh(s.geometry(), material); m.name = `bld ${key}`;
    m.castShadow = m.receiveShadow = false; group.add(m);
  }
  return { group, count };
}

function parapet(s: Soup, ring: [number, number][], top: number, col: THREE.Color) {
  const h = 0.45;
  const sign = signedArea(ring) > 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) continue;
    const nrm: [number, number, number] = [(dz / L) * sign, 0, (-dx / L) * sign];
    s.quad([x0, top, z0], [x1, top, z1], [x1, top + h, z1], [x0, top + h, z0], col, nrm);
    s.quad([x0, top, z0], [x1, top, z1], [x1, top + h, z1], [x0, top + h, z0], col, [-nrm[0], 0, -nrm[2]], [0.7, 0.7, 0.9, 0.9]);
    // cap
    const ix = -nrm[0] * 0.25, iz = -nrm[2] * 0.25;
    s.quad([x0, top + h, z0], [x1, top + h, z1], [x1 + ix, top + h, z1 + iz], [x0 + ix, top + h, z0 + iz], col, UP);
  }
}

function roofShape(s: Soup, b: Building, e: number, roof: THREE.Color, wall: THREE.Color) {
  const cx = b.o[0] / 10, cz = b.o[1] / 10, ang = b.o[2] / 1000, L = b.o[3] / 20, S = b.o[4] / 20;
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  const P = (u: number, v: number, y: number) => [cx + ux * u + vx * v, y, cz + uz * u + vz * v];
  const r = e + b.rh, o = 0.35; // eave overhang
  const drop = (o * b.rh) / Math.max(S, 0.5);
  const so = S + o, eo = e - drop;
  const face = (pts: number[][], col: THREE.Color) => {
    // hint: outward/upward from roof centre
    const m = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
    const hint: [number, number, number] = [m[0] - cx, Math.max(m[1] - (e - 50), 0.01), m[2] - cz];
    if (pts.length === 3) s.tri(pts[0], pts[1], pts[2], col, hint); else s.quad(pts[0], pts[1], pts[2], pts[3], col, hint);
  };
  const under = roof.clone().multiplyScalar(0.45);
  const soffit = (pts: number[][]) => { if (pts.length === 4) s.quad(pts[0], pts[1], pts[2], pts[3], under, [0, -1, 0]); };
  const shape = b.s === 'hipped' && L - S < 0.6 ? 'pyramidal' : b.s;
  if (shape === 'gabled' || shape === 'skillion') {
    const Lo = L + 0.15;
    if (shape === 'gabled') {
      face([P(-Lo, -so, eo), P(Lo, -so, eo), P(Lo, 0, r), P(-Lo, 0, r)], roof);
      face([P(-Lo, so, eo), P(Lo, so, eo), P(Lo, 0, r), P(-Lo, 0, r)], roof);
      // gable ends (wall colour)
      s.tri(P(-L, -S, e), P(-L, S, e), P(-L, 0, r), wall, [-ux, 0, -uz]);
      s.tri(P(L, -S, e), P(L, S, e), P(L, 0, r), wall, [ux, 0, uz]);
    } else {
      const hi = r, lo = eo;
      face([P(-Lo, -so, hi + drop), P(Lo, -so, hi + drop), P(Lo, so, lo), P(-Lo, so, lo)], roof);
      s.quad(P(-L, -S, e), P(L, -S, e), P(L, -S, hi), P(-L, -S, hi), wall, [-vx, 0, -vz]);
      s.tri(P(-L, -S, e), P(-L, S, e), P(-L, -S, hi), wall, [-ux, 0, -uz]);
      s.tri(P(L, -S, e), P(L, S, e), P(L, -S, hi), wall, [ux, 0, uz]);
    }
    soffit([P(-Lo, -so, eo), P(Lo, -so, eo), P(Lo, so, eo), P(-Lo, so, eo)]);
    return;
  }
  const Lo = L + o;
  if (shape === 'pyramidal' || shape === 'dome' || shape === 'round') {
    const top = P(0, 0, r);
    const c = [P(-Lo, -so, eo), P(Lo, -so, eo), P(Lo, so, eo), P(-Lo, so, eo)];
    for (let i = 0; i < 4; i++) face([c[i], c[(i + 1) % 4], top], roof);
    soffit(c);
    return;
  }
  // hipped (default for anything else pitched)
  const rl = Math.max(L - S, 0);
  const a = P(-rl, 0, r), bb = P(rl, 0, r);
  const c = [P(-Lo, -so, eo), P(Lo, -so, eo), P(Lo, so, eo), P(-Lo, so, eo)];
  face([c[0], c[1], bb, a], roof); face([c[2], c[3], a, bb], roof);
  face([c[1], c[2], bb], roof); face([c[3], c[0], a], roof);
  soffit(c);
}
