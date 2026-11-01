// Picks the worst steep-lot cases (tallest bare foundation wall) per area and writes camera poses for before/after shots.
// Usage: node tools/world/steep.mjs [out.json] [area ...]   (uses the current cleanup code; run it BEFORE changing the code to freeze the "before" cameras)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, sampleHeight } from '../../src/area/terrainCore.ts';
import { cleanArea, exposedHeight, ringOf, binfo } from '../../src/area/cleanup.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] || path.join(root, 'previews/map-cleanup/r3-cameras.json');
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ['newark', 'passaic'];
const res = {};
for (const id of ids) {
  const dir = path.join(root, 'public/areas', id), area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8'));
  const b = fs.readFileSync(path.join(dir, 'terrain.bin')), g = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), t = { ...g, heightAt: (x, z) => sampleHeight(g, x, z) };
  const c = cleanArea(area, t), list = [];
  for (const q of binfo(c.area.buildings)) {
    if (q.b.m > 0) continue; const floor = q.b.pad ?? 0.2, ex = exposedHeight(q.outer, floor, t.heightAt); if (ex < 2) continue;
    // lowest outline point = downhill side; camera stands beyond it, looking back at the wall
    let lo = Infinity, P = q.outer[0]; for (const p of q.outer) { const h = t.heightAt(p[0], p[1]); if (h < lo) { lo = h; P = p; } }
    const cx = q.outer.reduce((s, p) => s + p[0], 0) / q.outer.length, cz = q.outer.reduce((s, p) => s + p[1], 0) / q.outer.length;
    list.push({ ex, cx, cz, P, lo, floor, h: q.b.h });
  }
  list.sort((a, b) => b.ex - a.ex); const pick = [];
  for (const s of list) { if (pick.every((p) => Math.hypot(p.cx - s.cx, p.cz - s.cz) > 80)) pick.push(s); if (pick.length === 3) break; }
  res[id] = pick.map((s) => { const dx = s.P[0] - s.cx, dz = s.P[1] - s.cz, l = Math.hypot(dx, dz) || 1, px = s.P[0] + (dx / l) * 16, pz = s.P[1] + (dz / l) * 16;
    return { exposed: +s.ex.toFixed(2), center: [Math.round(s.cx), Math.round(s.cz)], pos: [+px.toFixed(1), +(Math.max(t.heightAt(px, pz), 0) + 4).toFixed(1), +pz.toFixed(1)], look: [+s.P[0].toFixed(1), +(s.floor - s.ex * 0.5).toFixed(1), +s.P[1].toFixed(1)] }; });
}
fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n'); console.log(JSON.stringify(res));
