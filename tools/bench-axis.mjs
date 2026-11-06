#!/usr/bin/env node
// Prints, for each bench GLB, where the backrest sits relative to the seat in model space (which of +x/-x/+z/-z is "back"), so town code can face the seat toward a focus.
//   node tools/bench-axis.mjs [file.glb ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const root = new URL('..', import.meta.url).pathname + 'public/tja/';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['metropolis/plaza_bench_01.glb', 'realistic-city/realistic_bench_01.glb'];
for (const f of files) {
  const doc = await io.read(root + f), pts = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) { const a = prim.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]); }
  const mn = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  // backrest = the tall part: mean x/z of vertices above 70 % of the height, vs the mean of vertices below 45 % (the seat)
  const h = mx[1] - mn[1], hi = pts.filter((p) => p[1] > mn[1] + 0.7 * h), lo = pts.filter((p) => p[1] < mn[1] + 0.45 * h && p[1] > mn[1] + 0.15 * h);
  const mean = (l, k) => l.reduce((s, p) => s + p[k], 0) / Math.max(1, l.length);
  const dx = mean(hi, 0) - mean(lo, 0), dz = mean(hi, 2) - mean(lo, 2);
  console.log(f, 'size', mx.map((v, k) => (v - mn[k]).toFixed(2)).join(' x '), 'backrest offset dx', dx.toFixed(3), 'dz', dz.toFixed(3), '=> back is', Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? '+x' : '-x') : (dz > 0 ? '+z' : '-z'), '(seat faces opposite)');
}
