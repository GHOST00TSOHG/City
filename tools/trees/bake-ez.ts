// Offline bake of the ez-tree broadleaf LODs (oak + ash, LOD0 / LOD1, branches + leaves) into public/trees/ez.bin + ez.json.
// The runtime used to run ez-tree's generator in the page at the first tile build (it allocates ~100 MB of temporary arrays that WebKit never gives back);
// now it just reads the typed arrays. Run:  node tools/trees/bake.mjs
import * as THREE from 'three';
import { Tree as EzTree } from '@eztree/tree.js';
import oakPreset from '@eztree/presets/oak_medium.json';
import ashPreset from '@eztree/presets/ash_medium.json';
import fs from 'node:fs';

function sphereNormals(g: THREE.BufferGeometry, c: THREE.Vector3) {
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).sub(c).normalize(); n.setXYZ(i, v.x, v.y * 0.8 + 0.2, v.z); }
  return g;
}
function normalise(gs: THREE.BufferGeometry[]) {
  const box = new THREE.Box3(); gs.forEach((g) => { g.computeBoundingBox(); box.union(g.boundingBox!); });
  const s = 10 / (box.max.y - box.min.y), c = box.getCenter(new THREE.Vector3());
  gs.forEach((g) => { g.translate(-c.x, -box.min.y, -c.z); g.scale(s, s, s); g.computeBoundingSphere(); });
}
function ezGeometry(preset: any, lod: number) {
  const tr = new EzTree(); tr.loadFromJson(structuredClone(preset));
  const o: any = tr.options; o.seed = preset.seed;
  if (lod === 1) {
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.ceil(o.branch.segments[k] / 2));
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.ceil(o.branch.sections[k] / 2));
    o.branch.levels = Math.max(1, o.branch.levels - 1); o.leaves.count = Math.max(4, Math.round(o.leaves.count * 0.8)); o.leaves.size *= 2.6;
  }
  tr.generate();
  const b = (tr.branchesMesh.geometry as any).clone() as THREE.BufferGeometry, l = (tr.leavesMesh.geometry as any).clone() as THREE.BufferGeometry;
  normalise([b, l]);
  l.computeBoundingBox(); const c = l.boundingBox!.getCenter(new THREE.Vector3());
  sphereNormals(l, c.setY(c.y - 1.5));
  return { b, l };
}

const out: { name: string; lod: number; part: 'b' | 'l'; n: number; m: number; pos: number; nrm: number; uv: number; idx: number; idx32: boolean }[] = [];
const chunks: Buffer[] = []; let off = 0;
const put = (a: ArrayBufferView) => { const o = off; chunks.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); off += a.byteLength; return o; };
for (const [name, preset] of [['ez-oak', oakPreset], ['ez-ash', ashPreset]] as const) {
  for (const lod of [0, 1]) {
    const g = ezGeometry(preset, lod);
    for (const part of ['b', 'l'] as const) {
      const geo = g[part], n = geo.attributes.position.count, ix = geo.index!.array, idx32 = n > 65535;
      const index = idx32 ? Uint32Array.from(ix) : Uint16Array.from(ix);
      const pos = put(new Float32Array(geo.attributes.position.array)), nrm = put(new Float32Array(geo.attributes.normal.array)), uv = put(new Float32Array(geo.attributes.uv.array));
      const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
      const idx = put(index);
      out.push({ name, lod, part, n, m: index.length, pos, nrm, uv, idx, idx32 });
      console.log(name, lod, part, 'verts', n, 'indices', index.length);
    }
  }
}
const dir = process.argv[2] ?? 'public/trees';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(`${dir}/ez.bin`, Buffer.concat(chunks)); fs.writeFileSync(`${dir}/ez.json`, JSON.stringify(out));
console.log('wrote', `${dir}/ez.bin`, off, 'bytes');
