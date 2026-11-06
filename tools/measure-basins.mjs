#!/usr/bin/env node
// Measures where the water surface belongs in each fountain / pond model: the highest level that carries a real area of upward-facing triangles inside the inner disc
// (the basin floor / water plane), in model metres above the model's base. Multiply by the item scale for FountainDef.waterY.   node tools/measure-basins.mjs [pack/file.glb ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const root = new URL('..', import.meta.url).pathname + 'public/tja/';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['city/park_fountain_01.glb', 'ancient-ruins/roman_fountain.glb', 'city-paris/wallace_fountain_01.glb', 'edo-village/koi_pond_tile.glb', 'cozy-village/water_pond_01.glb', 'nature/waterfall.glb'];
for (const f of files) {
  const doc = await io.read(root + f), tris = []; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const node of doc.getRoot().listScenes()[0].listChildren().flatMap(function walk(n) { return [n, ...n.listChildren().flatMap(walk)]; })) {
    const mesh = node.getMesh(); if (!mesh) continue; const w = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = idx ? idx.getCount() : pos.getCount(), P = (i) => { const v = [0, 0, 0]; pos.getElement(idx ? idx.getScalar(i) : i, v); return [w[0] * v[0] + w[4] * v[1] + w[8] * v[2] + w[12], w[1] * v[0] + w[5] * v[1] + w[9] * v[2] + w[13], w[2] * v[0] + w[6] * v[1] + w[10] * v[2] + w[14]]; };
      for (let i = 0; i + 2 < n; i += 3) { const a = P(i), b = P(i + 1), c = P(i + 2); for (const q of [a, b, c]) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } tris.push([a, b, c]); }
    }
  }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, R = 0.4 * Math.max(mx[0] - mn[0], mx[2] - mn[2]), levels = new Map();
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, A = Math.hypot(nx, ny, nz) / 2;
    if (A < 1e-6 || ny / (2 * A) < 0.95) continue;
    const gx = (a[0] + b[0] + c[0]) / 3, gz = (a[2] + b[2] + c[2]) / 3, gy = (a[1] + b[1] + c[1]) / 3 - mn[1]; if (Math.hypot(gx - cx, gz - cz) > R) continue;
    const k = Math.round(gy / 0.05) * 0.05; levels.set(k, (levels.get(k) ?? 0) + A);
  }
  const total = [...levels.values()].reduce((s, v) => s + v, 0), top = [...levels.entries()].filter(([, a]) => a > total * 0.08).sort((p, q) => q[0] - p[0])[0];
  console.log(f.padEnd(42), 'h', (mx[1] - mn[1]).toFixed(2), 'water level', top ? top[0].toFixed(2) : 'n/a', '(levels:', [...levels.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, a]) => `${k.toFixed(2)}:${a.toFixed(1)}`).join(' '), ')');
}
