// Part audit: node tools/glb-audit.mjs <type> [gitref=HEAD|file]  → JSON {meshName: {tris, mat, group, bbox}} (no deps; reads GLB JSON chunk)
import { execSync } from 'child_process'; import fs from 'fs';
export function parseGLB(buf) {
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString());
  const nodes = json.nodes, parent = new Map(); nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const out = {};
  nodes.forEach((n, i) => {
    if (n.mesh === undefined) return; const m = json.meshes[n.mesh]; let tris = 0, mat = new Set(); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of m.primitives) {
      tris += (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3; mat.add(json.materials?.[p.material]?.name ?? '?');
      const a = json.accessors[p.attributes.POSITION]; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a.min[k]); mx[k] = Math.max(mx[k], a.max[k]); }
    }
    let g = i; while (parent.has(g)) g = parent.get(g);
    out[n.name || `node${i}`] = { tris, mat: [...mat].join(','), group: nodes[g].name, bbox: mn.map((v, k) => +(mx[k] - v).toFixed(3)), ds: m.primitives.some((p) => json.materials?.[p.material]?.doubleSided) };
  });
  return out;
}
if (process.argv[1].endsWith('glb-audit.mjs')) {
  const [t, ref = 'HEAD'] = process.argv.slice(2);
  const buf = fs.existsSync(ref) ? fs.readFileSync(ref) : execSync(`git show ${ref}:public/robot/${t}/parts.glb`, { maxBuffer: 1 << 28 });
  console.log(JSON.stringify(parseGLB(buf)));
}
