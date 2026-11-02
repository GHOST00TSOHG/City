// heights along a line inside a tile: node stub.mjs id x z0 z1
import fs from 'fs';
import { decodeTerrain, sampleHeight } from '../../src/area/terrainCore.ts';
const [id, x, za, zb] = process.argv.slice(2);
const b = fs.readFileSync(`public/areas/${id}/terrain.bin`);
const t = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const out = [];
for (let z = +za; z <= +zb; z += (zb - za) / 20) out.push(`${z | 0}:${sampleHeight(t, +x, z).toFixed(1)}`);
console.log(out.join(' '));
