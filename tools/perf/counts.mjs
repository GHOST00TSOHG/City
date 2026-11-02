import fs from 'fs';
for (const id of ['newark', 'passaic', 'sandyhook', 'bayshore', 'keywest']) {
  const a = JSON.parse(fs.readFileSync(`public/areas/${id}/area.json`));
  let v = 0; for (const b of a.buildings) for (const r of b.r) v += r.length / 2;
  console.log(id, 'bld', a.buildings.length, 'ringVerts', v, 'roads', a.roads.length, 'trees', a.trees.length / 5, 'lamps', a.lamps.length);
}
