import * as THREE from 'three/webgpu';
import type { Building, Terrain } from './data';
import { Soup, ringPts, signedArea, flatPoly } from './geom';
import { foundation } from './foundation';
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
    // Foundation: floor on the high side of the lot (walls never buried by more than BURY_MAX), skirt down to the lowest terrain sample,
    // base cap under it. Parts (m > 0) hang off the building below them: no skirt.
    const fnd = foundation(rings, terrain), part = b.m > 0;
    const base = part ? fnd.floor + b.m : fnd.wallBase, bottom = part ? base : fnd.bottom;
    const top = fnd.floor + b.h;
    const pitched = b.s !== 'flat' && b.rh > 0.2;
    const eave = pitched ? top - b.rh : top;
    // Facade kind (inferred): 1 = house (small, pitched, low), 2 = commercial/apartment; parts floating above ground get none.
    const area = Math.abs(signedArea(outer));
    const kind = b.m > 2 ? 0 : (pitched || b.h < 7.5) && area < 400 ? 1 : 2;
    const seed = ((b.o[0] * 73856093) ^ (b.o[1] * 19349663)) >>> 0;
    // Walls: darker at the foot (cheap contact shading), lighter under the eave. The skirt (below the facade origin) carries no windows.
    for (const ring of rings) {
      const sign = signedArea(ring) > 0 ? 1 : -1;
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const nrm: [number, number, number] = [(dz / L) * sign, 0, (-dx / L) * sign];
        const foot = part ? 0.9 : 0.62;
        if (bottom < base - 0.001) { s.cur = [base, eave, pack, 0]; s.quad([x0, bottom, z0], [x1, bottom, z1], [x1, base, z1], [x0, base, z0], wall, nrm, [foot * 0.8, foot * 0.8, foot, foot]); }
        s.cur = [base, eave, kind + pack, (seed % 997) / 997];
        s.quad([x0, base, z0], [x1, base, z1], [x1, eave, z1], [x0, eave, z0], wall, nrm, [foot, foot, 1, 1]);
      }
    }
    s.cur = [base, eave, pack, 0]; // base cap, roofs, gables, soffits: no windows
    flatPoly(s, outer, rings.slice(1), bottom, trim, true); // closes the underside
    if (!pitched) {
      flatPoly(s, outer, rings.slice(1), top, roof);
      // Parapet lip on larger flat roofs reads as a real roof edge instead of a cut box.
      if (Math.abs(signedArea(outer)) > 120 && b.h > 5) parapet(s, outer, top, trim);
    } else {
      flatPoly(s, outer, rings.slice(1), eave, roof.clone().multiplyScalar(0.45)); // eave-level ceiling: closes the walls under the roof hull
      roofShape(s, b, eave, roof, wall);
    }
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

/** Parapet lip as one closed box per edge (0.25 m thick, 0.45 m high, ends overlap at corners), so every piece is watertight. */
function parapet(s: Soup, ring: [number, number][], top: number, col: THREE.Color) {
  const h = 0.45, t = 0.25, e = t / 2;
  const sign = signedArea(ring) > 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.05) continue;
    const ux = dx / L, uz = dz / L, nx = uz * sign, nz = -ux * sign; // outward normal
    const P = (u: number, v: number, y: number) => [x0 + ux * u + nx * v, y, z0 + uz * u + nz * v]; // u along the edge, v outward (0 = ring, -t = inward)
    const a = -e, b = L + e, y0 = top - 0.02, y1 = top + h;
    const f = (p: number[], q: number[], r: number[], w: number[], hint: [number, number, number], shade?: [number, number, number, number]) => s.quad(p, q, r, w, col, hint, shade);
    f(P(a, 0, y0), P(b, 0, y0), P(b, 0, y1), P(a, 0, y1), [nx, 0, nz]);            // outer
    f(P(a, -t, y0), P(b, -t, y0), P(b, -t, y1), P(a, -t, y1), [-nx, 0, -nz], [0.7, 0.7, 0.9, 0.9]); // inner
    f(P(a, -t, y1), P(b, -t, y1), P(b, 0, y1), P(a, 0, y1), UP);                   // cap
    f(P(a, -t, y0), P(b, -t, y0), P(b, 0, y0), P(a, 0, y0), [0, -1, 0]);           // underside
    f(P(a, -t, y0), P(a, 0, y0), P(a, 0, y1), P(a, -t, y1), [-ux, 0, -uz]);        // ends
    f(P(b, -t, y0), P(b, 0, y0), P(b, 0, y1), P(b, -t, y1), [ux, 0, uz]);
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
      // gable ends (wall colour), flush with the roof ends: one closed hull, no loose triangles on the wall tops
      s.tri(P(-Lo, -so, eo), P(-Lo, so, eo), P(-Lo, 0, r), wall, [-ux, 0, -uz]);
      s.tri(P(Lo, -so, eo), P(Lo, so, eo), P(Lo, 0, r), wall, [ux, 0, uz]);
    } else {
      const hi = r, lo = eo;
      face([P(-Lo, -so, hi + drop), P(Lo, -so, hi + drop), P(Lo, so, lo), P(-Lo, so, lo)], roof);
      // hull closure: back face under the high edge and both ends (wall colour)
      s.quad(P(-Lo, -so, eo), P(Lo, -so, eo), P(Lo, -so, hi + drop), P(-Lo, -so, hi + drop), wall, [-vx, 0, -vz]);
      s.tri(P(-Lo, -so, eo), P(-Lo, so, eo), P(-Lo, -so, hi + drop), wall, [-ux, 0, -uz]);
      s.tri(P(Lo, -so, eo), P(Lo, so, eo), P(Lo, -so, hi + drop), wall, [ux, 0, uz]);
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
