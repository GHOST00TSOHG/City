// Drop true debris triangles from a kit GLB, nothing else: any vertex far outside the robot's body box, or a degenerate long
// sliver (longest edge > MAXE and area < SLIVER of the square on that edge). Large flat panel faces (heavy soles, chest bands,
// worker chest) are real geometry and are kept; the earlier "any edge > 0.5 m" rule deleted them and left holes.
// The big stretched streaks themselves came from boolean-slice remnants (`chest_plate.006`, `shin_R.003`, ...): see
// tools/kit-drop-debris.mjs (run it first).   node tools/kit-strip-strays.mjs <type...>   Edits public/robot/<type>/parts.glb in place.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const BOX = { x: 1.4, yMin: -0.05, yMax: 2.75, z: 1.3 }, MAXE = 0.5, SLIVER = 0.02;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const t of process.argv.slice(2)) {
  const f = `public/robot/${t}/parts.glb`, doc = await io.read(f); let outside = 0, sliver = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!idx) continue;
    const P = (i) => pos.getElement(i, []);
    const bad = (i) => { const [x, y, z] = P(i); return Math.abs(x) > BOX.x || y < BOX.yMin || y > BOX.yMax || Math.abs(z) > BOX.z; };
    const a = idx.getArray(), keep = [];
    for (let i = 0; i < a.length; i += 3) {
      const [u, v, w] = [P(a[i]), P(a[i + 1]), P(a[i + 2])];
      if (bad(a[i]) || bad(a[i + 1]) || bad(a[i + 2])) { outside++; continue; }
      const e1 = [v[0] - u[0], v[1] - u[1], v[2] - u[2]], e2 = [w[0] - u[0], w[1] - u[1], w[2] - u[2]], e3 = [w[0] - v[0], w[1] - v[1], w[2] - v[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], area = Math.hypot(...cr) / 2;
      const L = Math.max(Math.hypot(...e1), Math.hypot(...e2), Math.hypot(...e3));
      if (L > MAXE && area < SLIVER * L * L) { sliver++; continue; }
      keep.push(a[i], a[i + 1], a[i + 2]);
    }
    if (keep.length !== a.length) idx.setArray(new a.constructor(keep));
  }
  await io.write(f, doc); console.log(t, 'dropped tris: outside box', outside, 'slivers', sliver);
}
