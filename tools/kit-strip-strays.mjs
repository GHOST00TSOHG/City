// Drop triangles that reach outside the robot's body box (boolean/bevel debris from the add-on pass shows up in game
// as huge stretched streaks): any vertex outside the body box, or any edge longer than MAXE (a real panel edge never is). node tools/kit-strip-strays.mjs <type...>   Edits public/robot/<type>/parts.glb in place.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const BOX = { x: 1.4, yMin: -0.05, yMax: 2.75, z: 1.3 }, MAXE = 0.5;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const t of process.argv.slice(2)) {
  const f = `public/robot/${t}/parts.glb`, doc = await io.read(f); let cut = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!idx) continue;
    const bad = (i) => { const [x, y, z] = pos.getElement(i, []); return Math.abs(x) > BOX.x || y < BOX.yMin || y > BOX.yMax || Math.abs(z) > BOX.z; };
    const d = (i, j) => { const u = pos.getElement(i, []), v = pos.getElement(j, []); return Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]); };
    const a = idx.getArray(), keep = [];
    for (let i = 0; i < a.length; i += 3) if (bad(a[i]) || bad(a[i + 1]) || bad(a[i + 2]) || Math.max(d(a[i], a[i + 1]), d(a[i + 1], a[i + 2]), d(a[i], a[i + 2])) > MAXE) cut++; else keep.push(a[i], a[i + 1], a[i + 2]);
    if (keep.length !== a.length) idx.setArray(new a.constructor(keep));
  }
  await io.write(f, doc); console.log(t, 'dropped tris', cut);
}
