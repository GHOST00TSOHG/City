// Per-area world audit. Usage: node tools/world/audit.mjs [--after] [--out file.json] [area ...]
// Runs the exact runtime code (src/area/cleanup.ts, dockPlan.ts, terrainCore.ts) under node type-stripping.
//   before = raw bake as it was drawn before the map-cleanup work; after = cleanArea() + docks applied.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, sampleHeight } from '../../src/area/terrainCore.ts';
import { cleanArea, auditWorld, ISSUES } from '../../src/area/cleanup.ts';
import { planDocks } from '../../src/area/dockPlan.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const after = args.includes('--after');
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : path.join(root, 'tools/world', after ? 'audit-after.json' : 'audit-before.json');
const AREAS = ['keywest', 'bayshore', 'sandyhook', 'newark', 'passaic'];
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const result = { mode: after ? 'after' : 'before', generated: new Date().toISOString(), areas: {} };

for (const id of ids.length ? ids : AREAS) {
  const dir = path.join(root, 'public/areas', id);
  const area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8'));
  const b = fs.readFileSync(path.join(dir, 'terrain.bin'));
  const g = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const terrain = { ...g, heightAt: (x, z) => sampleHeight(g, x, z) };
  let world = { area, terrain };
  let stats = {};
  if (after) {
    const c = cleanArea(area, terrain);
    stats = c.stats;
    const docks = planDocks(c.area.piers, terrain);
    world = { area: c.area, terrain, plans: c.plans, bridges: c.bridges, walls: c.walls, docks };
    stats.docks = { pilings: docks.pilings.length / 4, cleats: docks.cleats.length / 4, bumpers: docks.bumpers.length / 4, ladders: docks.ladders.length / 4, boats: docks.boats.length / 5 };
  }
  const r = auditWorld(world);
  result.areas[id] = { counts: r.counts, totals: r.totals, fixes: stats, examples: r.examples };
}
const total = Object.fromEntries(ISSUES.map((k) => [k, Object.values(result.areas).reduce((s, a) => s + a.counts[k], 0)]));
result.total = total;
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
const names = Object.keys(result.areas);
console.log(`${result.mode.toUpperCase()}`.padEnd(22) + names.map((n) => n.padStart(10)).join('') + 'total'.padStart(10));
for (const k of ISSUES) console.log(k.padEnd(22) + names.map((n) => String(result.areas[n].counts[k]).padStart(10)).join('') + String(total[k]).padStart(10));
console.log('wrote', path.relative(root, out));
