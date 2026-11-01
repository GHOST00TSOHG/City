// Make a kit GLB bone-local (what src/robot/kit.ts expects): each `<slot>__<opt>__<Bone>` empty sits at the game's rest bone position
// (src/robot/skeleton.json) and its meshes get the opposite translation. Needed for kits exported before v2export.py got its
// "update view layer after creating each bone empty" fix (c4a93db): those carry rest-pose robot coordinates with an identity
// child transform, so the loader skinned every part a second time by its bone's height (parts exploded apart, feet left behind).
// Idempotent: only meshes whose own translation is still zero are rebased. node tools/kit-rebase.mjs <type...>   (edits public/robot/<type>/parts.glb in place)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const SKEL = JSON.parse(fs.readFileSync('src/robot/skeleton.json', 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const t of process.argv.slice(2)) {
  const S = SKEL[t], par = { ...S.parents }, off = { ...S.bones };
  for (const k of Object.keys(S.parents)) if (k.startsWith('Left')) { const r = k.replace('Left', 'Right'); par[r] = S.parents[k] && S.parents[k].replace('Left', 'Right'); off[r] = [-S.bones[k][0], S.bones[k][1], S.bones[k][2]]; }
  const memo = {}, world = (n) => memo[n] ??= (par[n] ? world(par[n]).map((v, i) => v + off[n][i]) : [...off[n]]);
  const f = `public/robot/${t}/parts.glb`, doc = await io.read(f); let groups = 0, meshes = 0, skipped = 0;
  for (const g of doc.getRoot().listScenes()[0].listChildren()) {
    const bone = (g.getName() || '').split('__')[2]; if (!bone || !off[bone]) continue;
    const kids = g.listChildren().filter((c) => c.getMesh() || c.listChildren().length);
    const w = world(bone), rebase = kids.filter((c) => c.getTranslation().every((v) => v === 0));
    if (!rebase.length) { skipped++; continue; }
    g.setTranslation(w); for (const c of rebase) { c.setTranslation(w.map((v) => -v)); meshes++; } groups++;
  }
  await io.write(f, doc); console.log(t, 'rebased groups', groups, 'meshes', meshes, 'already bone-local groups', skipped);
}
