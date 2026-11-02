// prints tile world bounds (Newark-origin frame) from areas.json
import fs from 'fs';
const A = JSON.parse(fs.readFileSync(new URL('../bake/areas.json', import.meta.url)));
const K = Math.PI / 180 * 6378137, o = A.newark.origin;
for (const [id, d] of Object.entries(A)) {
  if (id[0] === '_') continue;
  const c = Math.cos(d.origin.lat * Math.PI / 180);
  const ox = (d.origin.lon - o.lon) * K * Math.cos(o.lat * Math.PI / 180), oz = -(d.origin.lat - o.lat) * K;
  const x0 = (d.bbox.west - d.origin.lon) * K * c, x1 = (d.bbox.east - d.origin.lon) * K * c;
  const zN = -(d.bbox.north - d.origin.lat) * K, zS = -(d.bbox.south - d.origin.lat) * K;
  console.log(id, 'off', ox | 0, oz | 0, 'local x', x0 | 0, x1 | 0, 'z', zN | 0, zS | 0, 'world x', (ox + x0) | 0, (ox + x1) | 0, 'z', (oz + zN) | 0, (oz + zS) | 0);
}
