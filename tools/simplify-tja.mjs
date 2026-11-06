#!/usr/bin/env node
// Offline decimation of ultra-dense pack models. Only shipped models (public/tja/used-files.json) over --min triangles are touched.
// Originals are copied once to .proof/glb-backup/ (gitignored); outputs are written back in place as meshopt-compressed GLBs.
// Usage: node tools/simplify-tja.mjs [--min 20000] [--ratio 0.35] [--error 0.005] [--dry]
// Never commit public/tja/. After running: node tools/stage-used-tja.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, unweld, normals, simplify, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : Number(process.argv[i + 1]); };
const MIN = arg('min', 20000), RATIO = arg('ratio', 0.35), ERROR = arg('error', 0.005), DRY = process.argv.includes('--dry');
const root = new URL('..', import.meta.url).pathname, tja = join(root, 'public/tja'), bak = join(root, '.proof/glb-backup');
const manifest = JSON.parse(readFileSync(join(tja, 'manifest.json'), 'utf8'));
const used = JSON.parse(readFileSync(join(tja, 'used-files.json'), 'utf8')).files;
const item = new Map(); for (const [pack, p] of Object.entries(manifest.packs)) for (const i of p.items) item.set(`${pack}/${i.f}`, i);

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
});
const tris = (doc) => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); n += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return n; };
const sig = (doc) => { const p = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()); return { prims: p.length, color: p.every((x) => !!x.getAttribute('COLOR_0')) || p.every((x) => !x.getAttribute('COLOR_0')), hasColor: p.some((x) => !!x.getAttribute('COLOR_0')), uv: p.some((x) => !!x.getAttribute('TEXCOORD_0')), mats: doc.getRoot().listMaterials().length, tex: doc.getRoot().listTextures().length }; };

const report = []; let before = 0, after = 0;
for (const f of used) {
  const it = item.get(f); if (!it || it.tris <= MIN) continue;
  const path = join(tja, f), src = existsSync(join(bak, f)) ? join(bak, f) : path; // always simplify from the pristine original
  const doc = await io.read(src), t0 = tris(doc), s0 = sig(doc);
  if (t0 <= MIN) continue;
  // flat-shaded lowpoly meshes have per-face normals, so nothing is shared and nothing can collapse: drop normals, weld on position/colour/uv, simplify, then restore flat normals
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR, lockBorder: false }), unweld(), normals({ overwrite: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const t1 = tris(doc), s1 = sig(doc);
  const ok = s1.hasColor === s0.hasColor && s1.uv === s0.uv && s1.mats === s0.mats && s1.tex === s0.tex && s1.prims === s0.prims && t1 > 0;
  report.push({ f, from: t0, to: t1, ok });
  if (!ok) { console.warn('SKIP (attribute/material change)', f, s0, s1); continue; }
  before += t0; after += t1;
  if (DRY) continue;
  if (!existsSync(join(bak, f))) { mkdirSync(dirname(join(bak, f)), { recursive: true }); copyFileSync(path, join(bak, f)); }
  await io.write(path, doc);
  Object.assign(it, { tris: t1, b: statSync(path).size, draco: 0, meshopt: 1 });
  console.log(`${f}: ${t0} -> ${t1} tris`);
}
if (!DRY) writeFileSync(join(tja, 'manifest.json'), JSON.stringify(manifest));
writeFileSync(join(root, '.proof/simplify-report.json'), JSON.stringify({ min: MIN, ratio: RATIO, error: ERROR, before, after, files: report }, null, 1));
console.log(`${report.filter((r) => r.ok).length}/${report.length} models, ${before} -> ${after} tris (${before ? Math.round((100 * after) / before) : 0}%)${DRY ? ' [dry]' : ''}`);
