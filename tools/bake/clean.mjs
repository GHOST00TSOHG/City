#!/usr/bin/env node
// Bake clean step: removes data defects from the baked buildings so the runtime never has to draw them.
//   - buildings standing in water (>= 10 % of the footprint under the sea plane, same ground the game renders)
//   - parts whose min_height reaches their top (inside-out, no volume)
//   - overlapping buildings (plan overlap > 1 m2 with > 1 m of shared height): duplicates dropped, a tall small building inside a larger lower one
//     becomes a hole in it, partial overlaps are trimmed (the smaller building yields), anything still overlapping is dropped
// bake.mjs calls cleanBuildings() before writing; run `node tools/bake/clean.mjs <area...>` to clean already-baked public/areas/<id> files
// (no network, idempotent: a second run changes nothing). Terrain is decoded with src/area/terrainCore.ts, exactly like the game.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { decodeTerrain, sampleHeight } from '../../src/area/terrainCore.ts';

export const LIMITS = { waterFraction: 0.10, overlapArea: 1.0, overlapY: 1.0, dupRatio: 0.6, target: 0.8 };
const ring = (r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push([r[i] / 10, r[i + 1] / 10]); return o; };
const flat = (pts) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
const area2 = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const inRings = (rs, x, z) => inPoly(rs[0], x, z) && !rs.slice(1).some((h) => inPoly(h, x, z));
function samples(rs, step = 1.0) {
  const pts = [];
  for (const r of rs) for (let i = 0; i < r.length; i++) { const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step)); for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]); }
  const xs = rs[0].map((p) => p[0]), zs = rs[0].map((p) => p[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const gs = Math.max(2, Math.min(5, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / 400)));
  for (let x = minX + gs / 2; x < maxX; x += gs) for (let z = minZ + gs / 2; z < maxZ; z += gs) if (inRings(rs, x, z)) pts.push([x, z]);
  return pts;
}
function tris(rs) {
  const c = rs[0].map(([x, z]) => new THREE.Vector2(x, z)), hs = rs.slice(1).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z))), all = [...c, ...hs.flat()];
  let idx; try { idx = THREE.ShapeUtils.triangulateShape(c, hs); } catch { return []; }
  return idx.map(([a, b, d]) => [[all[a].x, all[a].y], [all[b].x, all[b].y], [all[d].x, all[d].y]]);
}
function clip(subject, clipper) { // Sutherland-Hodgman, clipper convex
  const ccw = area2(clipper) > 0; let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length], inp = out; out = [];
    const side = (p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (ccw ? 1 : -1);
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
const interArea = (ta, tb) => { let s = 0; for (const a of ta) for (const b of tb) { const c = clip(a, b); if (c.length >= 3) s += Math.abs(area2(c)); } return s; };
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
function nearestOnRing(r, x, z) {
  let best = Infinity, bx = x, bz = z;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [cx, cz] = r[(i + 1) % r.length], dx = cx - ax, dz = cz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) { best = d; bx = px; bz = pz; }
  }
  return [bx, bz];
}
const dedupe = (p) => p.filter((q, i) => { const n = p[(i + 1) % p.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > 0.05; });

/** buildings: baked records (r rings in dm, h, m, s, rh, o ...). grid: decodeTerrain() result. Returns new list + stats; input records may be modified. */
export function cleanBuildings(buildings, grid) {
  const stats = { in: buildings.length, inWater: 0, badHeight: 0, duplicatesDropped: 0, holed: 0, trimmed: 0, droppedAfterTrim: 0 };
  const alive = [];
  for (const b of buildings) { // water
    const rs = b.r.map(ring).filter((r) => r.length >= 3); if (!rs.length) continue;
    if (b.m > 0 && b.h - b.m < 0.5) { stats.badHeight++; continue; } // part whose min_height reaches its top: inside-out, no volume
    if (!(b.m > 0)) { const pts = samples(rs); let wet = 0; for (const [x, z] of pts) if (sampleHeight(grid, x, z) < 0) wet++; if (wet / pts.length >= LIMITS.waterFraction) { stats.inWater++; continue; } }
    alive.push({ b, rs, area: Math.abs(area2(rs[0])) - rs.slice(1).reduce((s, h) => s + Math.abs(area2(h)), 0), dead: false, tr: null });
  }
  const bb = (e) => { const xs = e.rs[0].map((p) => p[0]), zs = e.rs[0].map((p) => p[1]); e.minX = Math.min(...xs); e.maxX = Math.max(...xs); e.minZ = Math.min(...zs); e.maxZ = Math.max(...zs); };
  alive.forEach(bb);
  const y0 = (e) => (e.b.m > 0 ? e.b.m : 0), y1 = (e) => e.b.h;
  const CS = 32, key = (x, z) => x * 100003 + z;
  const findPairs = () => {
    const hash = new Map(), pairs = [], seen = new Set();
    alive.forEach((e, i) => { if (e.dead) return; for (let x = Math.floor(e.minX / CS); x <= Math.floor(e.maxX / CS); x++) for (let z = Math.floor(e.minZ / CS); z <= Math.floor(e.maxZ / CS); z++) { const k = key(x, z); (hash.get(k) ?? hash.set(k, []).get(k)).push(i); } });
    for (const l of hash.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const a = Math.min(l[i], l[j]), c = Math.max(l[i], l[j]), pk = a * 1e7 + c; if (seen.has(pk)) continue; seen.add(pk);
      const A = alive[a], B = alive[c];
      if (A.maxX < B.minX || B.maxX < A.minX || A.maxZ < B.minZ || B.maxZ < A.minZ) continue;
      if (Math.min(y1(A), y1(B)) - Math.max(y0(A), y0(B)) < LIMITS.overlapY) continue;
      A.tr ??= tris(A.rs); B.tr ??= tris(B.rs); const ia = interArea(A.tr, B.tr); if (ia > LIMITS.target) pairs.push([ia, a, c]);
    }
    return pairs.sort((p, q) => q[0] - p[0]);
  };
  const rank = (e) => e.area + (e.b.src ? -1e6 : 0) + (e.b.h > 0 ? e.b.h * 1e-3 : 0); // smaller / Overture-sourced / shorter yields
  const refresh = (e) => { e.tr = tris(e.rs); e.area = Math.abs(area2(e.rs[0])) - e.rs.slice(1).reduce((s, h) => s + Math.abs(area2(h)), 0); bb(e); };
  const flatten = (e) => { e.b.s = 'flat'; e.b.rh = 0; };
  const quant = (p) => ring(flat(p)); // geometry is judged on the dm-quantised outline that is written to disk
  for (let pass = 0; pass < 5; pass++) {
    const pairs = findPairs(); if (!pairs.length) break;
    for (const [, ai, ci] of pairs) {
      const A = alive[ai], B = alive[ci]; if (A.dead || B.dead) continue;
      const [small, big] = rank(A) <= rank(B) ? [A, B] : [B, A];
      let ia = interArea(small.tr ??= tris(small.rs), big.tr ??= tris(big.rs)); if (ia <= LIMITS.target) continue;
      if (ia / Math.max(small.area, 1) >= LIMITS.dupRatio) {
        if (y1(small) <= y1(big) + 0.5) { small.dead = true; stats.duplicatesDropped++; continue; }
        const inside = small.rs[0].every(([x, z]) => inRings(big.rs, x, z)) && !big.rs.some((r) => r.some((p, i) => small.rs[0].some((q, k) => segsCross(p, r[(i + 1) % r.length], q, small.rs[0][(k + 1) % small.rs[0].length]))));
        if (inside && !(big.b.m > 0)) { const hole = small.rs[0].slice(); if ((area2(hole) > 0) === (area2(big.rs[0]) > 0)) hole.reverse(); big.rs.push(hole); big.b.r.push(flat(hole)); flatten(big); refresh(big); stats.holed++; continue; }
        small.dead = true; stats.duplicatesDropped++; continue;
      }
      // partial overlap: push the small building's vertices that lie inside the big one out to its outline, then shrink a little if needed
      small.rs[0] = quant(dedupe(small.rs[0].map((p) => (inRings(big.rs, p[0], p[1]) ? nearestOnRing(big.rs[0], p[0], p[1]) : p))));
      if (small.rs[0].length < 3) { small.dead = true; stats.droppedAfterTrim++; continue; }
      refresh(small); ia = interArea(small.tr, big.tr);
      const cx = small.rs[0].reduce((s, p) => s + p[0], 0) / small.rs[0].length, cz = small.rs[0].reduce((s, p) => s + p[1], 0) / small.rs[0].length;
      for (let k = 0; k < 8 && ia > LIMITS.target; k++) { small.rs[0] = quant(small.rs[0].map(([x, z]) => [cx + (x - cx) * 0.96, cz + (z - cz) * 0.96])); refresh(small); ia = interArea(small.tr, big.tr); }
      if (ia > LIMITS.target || small.area < 4) { small.dead = true; stats.droppedAfterTrim++; continue; }
      small.b.r[0] = flat(small.rs[0]); flatten(small); stats.trimmed++;
    }
  }
  const out = alive.filter((e) => !e.dead).map((e) => e.b);
  stats.out = out.length; return { buildings: out, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const ids = process.argv.slice(2); if (!ids.length) { console.error('usage: clean.mjs <area...>'); process.exit(1); }
  for (const id of ids) {
    const dir = path.join(root, 'public/areas', id), area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8'));
    const tb = fs.readFileSync(path.join(dir, 'terrain.bin')), grid = decodeTerrain(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength));
    const { buildings, stats } = cleanBuildings(area.buildings, grid);
    area.buildings = buildings; fs.writeFileSync(path.join(dir, 'area.json'), JSON.stringify(area));
    const mf = path.join(dir, 'manifest.json'), m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    m.counts.buildings = buildings.length; if (!m.clean) m.clean = stats; else if (stats.in !== stats.out || stats.trimmed || stats.holed) { for (const k of Object.keys(stats)) if (k !== 'in') m.clean[k] = k === 'out' ? stats.out : (m.clean[k] ?? 0) + stats[k]; } // cumulative over runs
    for (const f of ['area.json']) { const b = fs.readFileSync(path.join(dir, f)); if (m.sizes?.[f]) m.sizes[f] = { bytes: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length }; }
    fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n');
    console.log(id, JSON.stringify(stats));
  }
}
