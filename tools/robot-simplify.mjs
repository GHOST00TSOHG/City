// Reduce a robot kit's triangle count (meshoptimizer, attribute-aware so baked masks/normal UVs hold) and rewrite kit.json tris.
// Usage: node tools/robot-simplify.mjs heavy 0.6 [error]   — run on the Blender export (parts.glb), idempotent only from a fresh export.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
const [type, ratio = '0.6', error = '0.004'] = process.argv.slice(2);
const dir = `public/robot/${type}/`, io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(dir + 'parts.glb');
await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +error, lockBorder: false }));
const count = (n) => (n.getMesh()?.listPrimitives() ?? []).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0) + n.listChildren().reduce((s, c) => s + count(c), 0);
const meta = JSON.parse(fs.readFileSync(dir + 'kit.json', 'utf8')), tris = {};
for (const n of doc.getRoot().listScenes()[0].listChildren()) {
  const [s, o, b] = n.getName().split('__'); if (!b) continue;
  const k = `${s === 'body' ? 'body' : s}:${s === 'body' ? 'base' : o}`; tris[k] = (tris[k] ?? 0) + count(n);
}
meta.tris_export = meta.tris_export ?? meta.tris; meta.tris = tris; meta.simplify = { ratio: +ratio, error: +error, tool: 'meshoptimizer' };
await io.write(dir + 'parts.glb', doc); fs.writeFileSync(dir + 'kit.json', JSON.stringify(meta));
console.log(type, tris);
