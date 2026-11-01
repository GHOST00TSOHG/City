#!/usr/bin/env node
// Sanity check for tools/world/world.json: area boxes (in world metres) must not overlap,
// the connector must start/end at its areas' box edges, and its length is reported.
// Usage: node tools/world/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, projector } from '../bake/lib.mjs';

const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/world/world.json'), 'utf8'));
const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/bake/areas.json'), 'utf8'));
let bad = 0;
const box = {};
for (const [id, w] of Object.entries(W.areas)) {
  const a = A[id]; if (!a) { console.error('unknown area', id); bad++; continue; }
  const p = projector(a.origin); const [x0, z1] = p.fwd(a.bbox.west, a.bbox.south), [x1, z0] = p.fwd(a.bbox.east, a.bbox.north);
  box[id] = [x0 + w.offset[0], z0 + w.offset[1], x1 + w.offset[0], z1 + w.offset[1]].map(Math.round);
  console.log(id.padEnd(10), 'world box x', box[id][0], '..', box[id][2], ' z', box[id][1], '..', box[id][3]);
}
const ids = Object.keys(box);
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = box[ids[i]], b = box[ids[j]];
  const gx = Math.max(a[0] - b[2], b[0] - a[2]), gz = Math.max(a[1] - b[3], b[1] - a[3]);
  const gap = Math.max(gx, gz);
  const same = W.areas[ids[i]].cluster === W.areas[ids[j]].cluster;
  if (gap < 0 && !same) { console.error(`overlap: ${ids[i]} / ${ids[j]}`); bad++; }
}
const near = (pt, b) => pt[0] >= b[0] - 50 && pt[0] <= b[2] + 50 && pt[1] >= b[1] - 50 && pt[1] <= b[3] + 50;
for (const c of W.connectors) {
  let len = 0; for (let i = 1; i < c.points.length; i++) len += Math.hypot(c.points[i][0] - c.points[i - 1][0], c.points[i][1] - c.points[i - 1][1]);
  console.log(`${c.id}: ${(len / 1000).toFixed(2)} km, ${c.from} -> ${c.to}`);
  if (!near(c.points[0], box[c.from])) { console.error(`${c.id}: start not at ${c.from}`); bad++; }
  if (!near(c.points.at(-1), box[c.to])) { console.error(`${c.id}: end not at ${c.to}`); bad++; }
}
if (bad) { console.error(bad, 'problem(s)'); process.exit(1); } else console.log('world.json OK');
