#!/usr/bin/env node
// Measures every model referenced by src/area/townDefs.ts (width x height x depth in model metres, front = +z) and writes /tmp/town-sizes.json; prints the table.
//   node tools/glb-size.mjs [pack/file ...]    (no args = all models named in townDefs.ts)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const root = new URL('..', import.meta.url).pathname;
let files = process.argv.slice(2);
if (!files.length) {
  const text = readFileSync(root + 'src/area/townDefs.ts', 'utf8'), fn = {}; for (const m of text.matchAll(/\b(\w+) = mk\('([\w-]+)'\)/g)) fn[m[1]] = m[2];
  const set = new Set(); for (const m of text.matchAll(/\b(\w+)\('([\w]+)'\)/g)) if (fn[m[1]]) set.add(`${fn[m[1]]}/${m[2]}.glb`); for (const m of text.matchAll(/\brc\('([\w]+)'\)/g)) set.add(`realistic-city/${m[1]}.glb`); files = [...set];
}
const out = {};
for (const f of files) {
  try {
    const doc = await io.read(root + 'public/tja/' + f); let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const scene = doc.getRoot().listScenes()[0];
    const walk = (node, m4) => { // world transform of each node (translation/scale/rotation via gltf-transform helpers)
      const w = node.getWorldMatrix(); const mesh = node.getMesh(); if (!mesh) return;
      for (const prim of mesh.listPrimitives()) { const a = prim.getAttribute('POSITION'), acc = a; const n = acc.getCount(), v = [0, 0, 0]; for (let i = 0; i < n; i++) { acc.getElement(i, v); const x = w[0] * v[0] + w[4] * v[1] + w[8] * v[2] + w[12], y = w[1] * v[0] + w[5] * v[1] + w[9] * v[2] + w[13], z = w[2] * v[0] + w[6] * v[1] + w[10] * v[2] + w[14]; mn = [Math.min(mn[0], x), Math.min(mn[1], y), Math.min(mn[2], z)]; mx = [Math.max(mx[0], x), Math.max(mx[1], y), Math.max(mx[2], z)]; } }
    };
    scene.traverse((n) => walk(n));
    out[f] = { w: +(mx[0] - mn[0]).toFixed(2), h: +(mx[1] - mn[1]).toFixed(2), d: +(mx[2] - mn[2]).toFixed(2) };
  } catch (e) { out[f] = { err: String(e.message).slice(0, 60) }; }
}
writeFileSync('/tmp/town-sizes.json', JSON.stringify(out));
for (const [f, s] of Object.entries(out)) console.log(f.padEnd(52), s.err ?? `${s.w} x ${s.h} x ${s.d}`);
