// Remove boolean-slice remnants from a kit GLB. The add-on pass (Hard Ops boolean cuts on chest / thigh / shin / calf vents) leaves
// the cut-off pieces behind as extra objects named `<part>.001, .002 ...`; they are not part of the design: their bounding box
// sprawls well past the part they were cut from (30-60x its volume on the legs, a 1.2 m shell around a 0.6 m chest) and they
// render as big loose sheets and shells around the robot. A mesh is debris when (a) its name is `<base>.NNN`, (b) a mesh `<base>`
// exists in the same kit, and (c) its bbox is more than 3x the base's volume and pokes more than SLACK metres outside it. Look-alike
// copies (bolts: Sphere.001...) are the same size as their base and are kept.   node tools/kit-drop-debris.mjs <type...>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const SLACK = 0.12, io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const bbox = (m) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = [0, 0, 0]; for (const p of m.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (const i of new Set(p.getIndices().getArray())) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } } return { mn, mx }; };
const vol = (b) => (b.mx[0] - b.mn[0]) * (b.mx[1] - b.mn[1]) * (b.mx[2] - b.mn[2]);
const tris = (m) => m.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
for (const t of process.argv.slice(2)) {
  const f = `public/robot/${t}/parts.glb`, doc = await io.read(f), nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  const base = new Map(); for (const n of nodes) if (!/\.\d{3}$/.test(n.getName())) base.set(n.getName(), bbox(n.getMesh()));
  let n0 = 0, t0 = 0;
  for (const n of nodes) {
    const m = /^(.*)\.\d{3}$/.exec(n.getName()); const b = m && base.get(m[1]); if (!b) continue;
    const e = bbox(n.getMesh()); if (vol(e) < 3 * vol(b) || !e.mn.some((v, k) => v < b.mn[k] - SLACK || e.mx[k] > b.mx[k] + SLACK)) continue;
    t0 += tris(n.getMesh()); n0++; n.getMesh().dispose(); n.setMesh(null); n.dispose();
  }
  await io.write(f, doc); console.log(t, 'dropped slice remnants', n0, 'tris', t0);
}
