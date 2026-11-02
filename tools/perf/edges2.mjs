// where is land on a tile edge, and the nearest major road end to it
import fs from 'fs';
import { decodeTerrain } from '../../src/area/terrainCore.ts';
const [id, side] = process.argv.slice(2);
const b = fs.readFileSync(`public/areas/${id}/terrain.bin`);
const t = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const { nx, nz, cell, x0, z0, h } = t;
const idx = side === 'north' ? (i) => i : side === 'south' ? (i) => (nz - 1) * nx + i : null;
let runs = [], cur = null;
for (let i = 0; i < nx; i++) { const v = h[idx(i)]; if (v > 0) { if (!cur) runs.push(cur = [i, i, v]); else { cur[1] = i; cur[2] = Math.max(cur[2], v); } } else cur = null; }
console.log(id, side, 'land runs (x m local):', runs.map(([a, c, m]) => `${x0 + a * cell}..${x0 + c * cell} max ${m.toFixed(1)}`).join(' | '));
const area = JSON.parse(fs.readFileSync(`public/areas/${id}/area.json`));
const zEdge = side === 'north' ? z0 : z0 + (nz - 1) * cell;
let best = [];
for (const r of area.roads) if (r.c <= 1) for (let i = 0; i + 1 < r.p.length; i += 2) best.push([Math.abs(r.p[i + 1] / 10 - zEdge), r.p[i] / 10, r.p[i + 1] / 10, r.c, r.w]);
best.sort((a, c) => a[0] - c[0]);
console.log('nearest major road pts (dz, x, z, class, w):', best.slice(0, 6).map((a) => a.map((v) => +v.toFixed(0)).join(',')).join(' | '));
