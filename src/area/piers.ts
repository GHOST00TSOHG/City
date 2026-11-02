import * as THREE from 'three/webgpu';
import type { Pier, Terrain } from './data';
import { Soup, flatPoly, ringPts, signedArea } from './geom';

/** Boat docks and boardwalks: a closed timber slab on pilings. Every dock gets ONE deck height (so the slab is a clean flat shape):
 *  over open water 1.0 m above the sea, raised to sit just above the highest ground it touches (a dock reaches the bank at the
 *  bank's height), never above 5 m. Slab = top + underside + side walls on the same outline (watertight), pilings are closed boxes
 *  that start inside the slab and end inside the seabed / ground. */
export const DECK_WATER = 1.0, DECK_MAX = 5, DECK_THICK = 0.28, POST = 0.32, POST_STEP = 3.2;

const DECK = new THREE.Color(0x8a7458), DECK_SIDE = new THREE.Color(0x5e4e3c), POSTC = new THREE.Color(0x3f3328);

const pierRing = (p: Pier) => ringPts((p.poly ?? p.line)!);

/** Dense boundary samples (every ~2 m). */
function samples(p: Pier) {
  const pts = pierRing(p), n = pts.length, out: [number, number][] = [];
  for (let i = 0; i < (p.poly ? n : n - 1); i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2)); for (let s = 0; s < k; s++) out.push([x0 + ((x1 - x0) * s) / k, z0 + ((z1 - z0) * s) / k]); }
  return out;
}

/** Deck height for one pier (see above). Pure: the map audit calls it too. */
export function pierDeck(p: Pier, t: Terrain): number {
  const all = samples(p).map(([x, z]) => t.heightAt(x, z)), hs = all.filter((h) => h > 0.3).sort((a, b) => a - b);
  if (!hs.length) return DECK_WATER;
  // mostly on land = a boardwalk: sit near the ground (80th percentile + a little); mostly water = a dock reaching the bank: clear the bank (90th + 0.3)
  const boardwalk = hs.length / all.length > 0.5, q = hs[Math.min(hs.length - 1, Math.floor(hs.length * (boardwalk ? 0.8 : 0.9)))];
  return Math.min(DECK_MAX, Math.max(DECK_WATER, q + (boardwalk ? 0.15 : 0.3)));
}

/** Pilings on a closed box: 4 sides + a cap at both ends. */
function post(s: Soup, x: number, z: number, top: number, bottom: number) {
  const h = POST / 2, c = (dx: number, dz: number, y: number) => [x + dx, y, z + dz];
  const sides: [number, number][][] = [[[-h, -h], [h, -h]], [[h, -h], [h, h]], [[h, h], [-h, h]], [[-h, h], [-h, -h]]];
  for (const [[ax, az], [bx, bz]] of sides) s.quad(c(ax, az, top), c(bx, bz, top), c(bx, bz, bottom), c(ax, az, bottom), POSTC, [bz - az, 0, -(bx - ax)]);
  s.quad(c(-h, -h, top), c(h, -h, top), c(h, h, top), c(-h, h, top), POSTC, [0, 1, 0]);
  s.quad(c(-h, -h, bottom), c(h, -h, bottom), c(h, h, bottom), c(-h, h, bottom), POSTC, [0, -1, 0]);
}

/** Pilings along an outline every ~POST_STEP m (always at the corners), from the slab underside down into the ground. */
function posts(s: Soup, t: Terrain, pts: [number, number][], closed: boolean, bottomOf: number) {
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.round(L / POST_STEP));
    for (let q = 0; q < k; q++) {
      const x = x0 + ((x1 - x0) * q) / k, z = z0 + ((z1 - z0) * q) / k, g = t.heightAt(x, z) - 0.5; // 0.5 m into the ground
      if (g > bottomOf - 0.2) continue; // ground is above the slab underside here: nothing to hold up
      post(s, x, z, bottomOf + 0.1, g);
    }
  }
  if (!closed) { const [x, z] = pts[n - 1], g = t.heightAt(x, z) - 0.5; if (g <= bottomOf - 0.2) post(s, x, z, bottomOf + 0.1, g); }
}

/** One closed oriented box (a slab segment) from a to b with half-width w, extended by w at both ends so bends overlap. */
function segmentSlab(s: Soup, a: [number, number], b: [number, number], w: number, top: number, bot: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) return;
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const P = (u: number, v: number): [number, number] => [a[0] + ux * u + nx * v, a[1] + uz * u + nz * v];
  const ring = [P(-w, -w), P(L + w, -w), P(L + w, w), P(-w, w)];
  slab(s, ring, top, bot);
}

/** Watertight slab for a simple outline: top face, underside, and outward side walls sharing the outline's vertices. */
function slab(s: Soup, ring: [number, number][], top: number, bot: number) {
  flatPoly(s, ring, [], top, DECK); flatPoly(s, ring, [], bot, DECK_SIDE, true);
  const ccw = signedArea(ring) > 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], dx = x1 - x0, dz = z1 - z0;
    const out: [number, number, number] = ccw ? [dz, 0, -dx] : [-dz, 0, dx];
    s.quad([x0, top, z0], [x1, top, z1], [x1, bot, z1], [x0, bot, z0], DECK_SIDE, out);
  }
}

/** Longest landing walkway (m) a dock may need to reach the bank; a pier farther from any land than this is dropped (it is a terrain/mask mismatch, not a dock). */
export const LANDING_MAX = 80;
const LAND_Y = 0.1;

/** Nearest land to a pier: null when it already touches land (a boundary sample within 2 m of ground above the sea), else
 *  { from: pier boundary sample, to: land point, dist } or `far` when there is none within LANDING_MAX. */
export function nearestLand(p: Pier, t: Terrain): null | { from: [number, number]; to: [number, number]; dist: number } | 'far' {
  const sm = samples(p);
  if (sm.some(([x, z]) => t.heightAt(x, z) > LAND_Y || [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => t.heightAt(x + dx, z + dz) > LAND_Y))) return null;
  const pick = sm.length <= 24 ? sm : Array.from({ length: 24 }, (_, i) => sm[Math.floor((i * sm.length) / 24)]);
  let best: { from: [number, number]; to: [number, number]; dist: number } | null = null;
  for (let R = 3; R <= LANDING_MAX && (!best || R < best.dist); R += 3) for (const f of pick) for (let a = 0; a < 16; a++) {
    const x = f[0] + Math.cos((a / 16) * Math.PI * 2) * R, z = f[1] + Math.sin((a / 16) * Math.PI * 2) * R;
    if (t.heightAt(x, z) > LAND_Y && (!best || R < best.dist)) best = { from: f, to: [x, z], dist: R };
  }
  return best ?? 'far';
}

/** Sloped closed walkway slab from a (top height y0) to b (top height y1), `w` wide: top, underside, both sides and both ends. */
function ramp(s: Soup, a: [number, number], b: [number, number], w: number, y0: number, y1: number, thick: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) return;
  const ux = dx / L, uz = dz / L, nx = -uz * w, nz = ux * w;
  const T = [[a[0] + nx, y0, a[1] + nz], [b[0] + nx, y1, b[1] + nz], [b[0] - nx, y1, b[1] - nz], [a[0] - nx, y0, a[1] - nz]], B = T.map(([x, y, z]) => [x, y - thick, z]);
  s.quad(T[0], T[1], T[2], T[3], DECK, [0, 1, 0]); s.quad(B[0], B[1], B[2], B[3], DECK_SIDE, [0, -1, 0]);
  s.quad(T[0], T[1], B[1], B[0], DECK_SIDE, [-uz, 0, ux]); s.quad(T[3], T[2], B[2], B[3], DECK_SIDE, [uz, 0, -ux]);
  s.quad(T[0], T[3], B[3], B[0], DECK_SIDE, [-ux, 0, -uz]); s.quad(T[1], T[2], B[2], B[1], DECK_SIDE, [ux, 0, uz]);
}

/** Adds every pier/dock to `s`. Returns how many were built. */
export function buildPiers(s: Soup, piers: Pier[], t: Terrain) {
  let built = 0;
  for (const p of piers) {
    const D = pierDeck(p, t), bot = D - DECK_THICK, land = nearestLand(p, t);
    if (land === 'far') continue; // nothing to tie it to
    if (land) { // landing walkway from the pier to the bank, ramped, on pilings
      const [fx, fz] = land.from, ux = (land.to[0] - fx) / land.dist, uz = (land.to[1] - fz) / land.dist, ex = land.to[0] + ux * 1.5, ez = land.to[1] + uz * 1.5;
      const y1 = Math.min(DECK_MAX + 0.5, Math.max(t.heightAt(ex, ez), t.heightAt(land.to[0], land.to[1])) + 0.12);
      ramp(s, [fx, fz], [ex, ez], 1.2, D, y1, DECK_THICK);
      const k = Math.max(1, Math.round(land.dist / POST_STEP));
      for (let q = 1; q < k; q++) { const f = q / k, x = fx + (ex - fx) * f, z = fz + (ez - fz) * f, top = D + (y1 - D) * f - DECK_THICK, g = t.heightAt(x, z) - 0.5; for (const sg of [-1, 1]) { const px = x - uz * 1.0 * sg, pz = z + ux * 1.0 * sg; if (g <= top - 0.2) post(s, px, pz, top + 0.1, Math.min(g, t.heightAt(px, pz) - 0.5)); } }
    }
    if (p.poly) {
      let ring = pierRing(p); if (ring.length < 3) continue;
      if (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-3) ring = ring.slice(0, -1);
      if (ring.length < 3 || Math.abs(signedArea(ring)) < 0.5) continue;
      slab(s, ring, D, bot); posts(s, t, ring, true, bot); built++;
    } else if (p.line) {
      const pts = pierRing(p); if (pts.length < 2) continue;
      const w = Math.max((p.w ?? 2) / 2, 0.8);
      for (let i = 0; i < pts.length - 1; i++) segmentSlab(s, pts[i], pts[i + 1], w, D, bot);
      // pilings in pairs either side of the walkway
      for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / L, nz = (x1 - x0) / L; const k = Math.max(1, Math.round(L / POST_STEP)); for (let q = 0; q <= k; q++) { const x = x0 + ((x1 - x0) * q) / k, z = z0 + ((z1 - z0) * q) / k; for (const sg of [-1, 1]) { const px = x + nx * (w - 0.2) * sg, pz = z + nz * (w - 0.2) * sg, g = t.heightAt(px, pz) - 0.5; if (g <= bot - 0.2) post(s, px, pz, bot + 0.1, g); } } }
      built++;
    }
  }
  return built;
}
