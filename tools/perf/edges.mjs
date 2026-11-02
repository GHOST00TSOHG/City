// edge profile of each tile: land fraction along each side + nearest major road to each edge
import fs from 'fs';
import { decodeTerrain } from '../../src/area/terrainCore.ts';
for (const id of process.argv.slice(2)) {
  const b = fs.readFileSync(`public/areas/${id}/terrain.bin`);
  const t = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const { nx, nz, cell, x0, z0, h } = t;
  const side = (name, idx) => { const v = idx.map((i) => h[i]); console.log(id, name, 'land%', (100 * v.filter((x) => x > 0).length / v.length) | 0, 'min', Math.min(...v).toFixed(1), 'max', Math.max(...v).toFixed(1)); };
  console.log(id, 'nx nz cell x0 z0', nx, nz, cell, x0, z0);
  side('north', [...Array(nx)].map((_, i) => i));
  side('south', [...Array(nx)].map((_, i) => (nz - 1) * nx + i));
  side('west', [...Array(nz)].map((_, i) => i * nx));
  side('east', [...Array(nz)].map((_, i) => i * nx + nx - 1));
  const area = JSON.parse(fs.readFileSync(`public/areas/${id}/area.json`));
  const ends = [];
  for (const r of area.roads) if (r.c <= 1) for (let i = 0; i + 1 < r.p.length; i += 2) ends.push([r.p[i] / 10, r.p[i + 1] / 10, r.c, r.w]);
  const zmin = Math.min(...ends.map((e) => e[1])), zmax = Math.max(...ends.map((e) => e[1]));
  console.log(id, 'major roads z range', zmin | 0, zmax | 0, 'n', ends.length);
}
