/** Dock layout (PURE, shared with tools/world/audit.mjs): fits timber pilings, cleats, bumpers, ladders and moored boats to every pier
 *  polygon / boardwalk line in the bake, from the terrain under it. docks.ts turns the plan into instanced meshes. */
import type { AreaData, Terrain } from './data';

type P = [number, number];
const ring = (r: number[]) => { const o: P[] = []; for (let i = 0; i + 1 < r.length; i += 2) o.push([r[i] / 10, r[i + 1] / 10]); return o; };
const inPoly = (x: number, z: number, p: P[]) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const hash = (x: number, z: number) => { let h = (Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };

export const DOCK = { DECK: 1.15, SEABED_EMBED: 0.3, CAP: 0.45 };
export interface Deck { pts: P[]; dir: number; line: boolean }
export interface DockPlan {
  decks: Deck[];
  pilings: number[];  // x, z, bottom y, top y
  cleats: number[];   // x, z, y, heading
  bumpers: number[];  // x, z, y, heading
  ladders: number[];  // x, z, y, heading of the outward normal
  boats: number[];    // x, z, heading, length, colour index
  piers: { over: number; pilings: number }[];
}
export const deckAt = (t: Terrain, x: number, z: number) => Math.max(DOCK.DECK, t.heightAt(x, z) + 0.12);

/** Outline of a boardwalk line as a closed polygon (offset both sides). */
function outline(line: P[], w: number): P[] {
  const L: P[] = [], R: P[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(i - 1, 0)], b = line[Math.min(i + 1, line.length - 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
    L.push([line[i][0] + nx, line[i][1] + nz]); R.push([line[i][0] - nx, line[i][1] - nz]);
  }
  return L.concat(R.reverse());
}
export function planDocks(piers: AreaData['piers'], t: Terrain, maxBoats = 400): DockPlan {
  const plan: DockPlan = { decks: [], pilings: [], cleats: [], bumpers: [], ladders: [], boats: [], piers: [] };
  const polys: P[][] = piers.map((p) => (p.poly ? ring(p.poly) : p.line ? outline(ring(p.line), Math.max((p.w ?? 2) / 2, 0.8)) : []));
  const bbs = polys.map((o) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of o) { a = Math.min(a, p[0]); c = Math.max(c, p[0]); b = Math.min(b, p[1]); d = Math.max(d, p[1]); } return [a, b, c, d]; });
  const inAnyPier = (x: number, z: number, skip = -1) => { for (let k = 0; k < polys.length; k++) { if (k === skip || polys[k].length < 3) continue; const b = bbs[k]; if (x >= b[0] - 1 && x <= b[2] + 1 && z >= b[1] - 1 && z <= b[3] + 1 && inPoly(x, z, polys[k])) return true; } return false; };
  const wet = (x: number, z: number, d = 0.3) => t.heightAt(x, z) < d;
  polys.forEach((pts, k) => {
    const rec = { over: 0, pilings: 0 }; plan.piers.push(rec);
    if (pts.length < 3) return;
    let area = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sgn = area >= 0 ? 1 : -1;
    // main axis (longest edge) for the plank direction
    let best = 0, dir = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > best) { best = l; dir = Math.atan2(q[1] - p[1], q[0] - p[0]); } }
    plan.decks.push({ pts, dir, line: !!piers[k].line });
    let boats = 0;
    const piling = (x: number, z: number) => {
      if (!wet(x, z, 0.4)) return;
      const bot = Math.max(t.heightAt(x, z), -9) - DOCK.SEABED_EMBED;
      plan.pilings.push(x, z, bot, deckAt(t, x, z) + DOCK.CAP); rec.pilings++;
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); if (L < 0.4) continue;
      const ux = dx / L, uz = dz / L, nx = uz * sgn, nz = -ux * sgn, head = Math.atan2(dz, dx);
      const n = Math.max(1, Math.round(L / 2.4));
      for (let s = 0; s <= n; s++) { // pilings along the edge, pulled in so they sit under the deck rim
        const f = s / n, x = p[0] + dx * f - nx * 0.18, z = p[1] + dz * f - nz * 0.18;
        if (wet(x, z, 0.4)) rec.over++;
        piling(x, z);
      }
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, outWet = wet(mx + nx * 1.6, mz + nz * 1.6, -0.2);
      if (!outWet) continue; // shore-side or land edge: no fenders, boats or ladders
      for (let d = 1.5; d < L - 0.8; d += 3.6) { const x = p[0] + ux * d, z = p[1] + uz * d; plan.bumpers.push(x + nx * 0.07, z + nz * 0.07, deckAt(t, x, z) - 0.32, head); }
      for (let d = 2.2; d < L - 1; d += 6) { const x = p[0] + ux * d - nx * 0.25, z = p[1] + uz * d - nz * 0.25; plan.cleats.push(x, z, deckAt(t, x, z), head); }
      if (L >= 8 && hash(mx, mz) < 0.55) plan.ladders.push(mx + nx * 0.05, mz + nz * 0.05, deckAt(t, mx, mz), Math.atan2(nz, nx));
      if (L >= 7 && boats < 3 && plan.boats.length / 5 < maxBoats && hash(mz, mx) < 0.5) {
        const len = [4.5, 6, 7.5, 9][Math.floor(hash(mx + 1, mz) * 4) % 4], beam = len * 0.34, off = beam / 2 + 1.2;
        const bx = mx + nx * off, bz = mz + nz * off, hx = ux * len / 2, hz = uz * len / 2;
        const ok = [[0, 0], [1, 1], [-1, -1]].every(([a]) => { const x = bx + hx * a, z = bz + hz * a; return t.heightAt(x, z) < -0.6 && !inAnyPier(x, z, k) && !inAnyPier(x + nx * beam * 0.6, z + nz * beam * 0.6, k); });
        let clash = false; for (let j = 0; j < plan.boats.length; j += 5) if (Math.hypot(plan.boats[j] - bx, plan.boats[j + 1] - bz) < len * 0.5 + plan.boats[j + 3] * 0.5 + beam) { clash = true; break; }
        if (ok && !clash) { plan.boats.push(bx, bz, head, len, Math.floor(hash(bx, bz) * 6)); boats++; }
      }
    }
    // interior bents for wide decks (every ~5 m on a grid)
    const bb = bbs[k]; if ((bb[2] - bb[0]) * (bb[3] - bb[1]) < 6e4) for (let x = bb[0] + 2.5; x < bb[2]; x += 5) for (let z = bb[1] + 2.5; z < bb[3]; z += 5) if (inPoly(x, z, pts)) { if (wet(x, z, 0.4)) rec.over++; piling(x, z); }
  });
  return plan;
}
