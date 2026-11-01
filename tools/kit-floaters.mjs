// Floating-part audit: for every slot option (with the always-on body), report meshes that are not connected to the rest of the robot.
// Connected = bounding boxes (rest pose, world space) overlap or are within TOL metres, transitively, starting from the body mesh set.
//   node tools/kit-floaters.mjs [types...]      exit 1 if any part floats (exceptions: tools/kit-floaters.allow.json {"type": ["nodeName/meshName"]})
import fs from 'fs'; import { readGLB } from './kit-manifest.mjs';
const TOL = 0.03, skel = JSON.parse(fs.readFileSync('src/robot/skeleton.json', 'utf8')), allow = fs.existsSync('tools/kit-floaters.allow.json') ? JSON.parse(fs.readFileSync('tools/kit-floaters.allow.json', 'utf8')) : {};
function boneWorld(t) {
  const S = skel[t], pos = {}, par = S.parents, off = {};
  for (const [b, o] of Object.entries(S.bones)) { off[b] = o; if (b.startsWith('Left')) off[b.replace('Left', 'Right')] = [-o[0], o[1], o[2]]; }
  const parent = (b) => (b.startsWith('Right') ? (par[b.replace('Right', 'Left')] || null)?.replace('Left', 'Right') ?? null : par[b] ?? null);
  const w = (b) => { if (pos[b]) return pos[b]; const p = parent(b), o = off[b], pw = p ? w(p) : [0, 0, 0]; return (pos[b] = [pw[0] + o[0], pw[1] + o[1], pw[2] + o[2]]); };
  return (b) => (off[b] ? w(b) : [0, 0, 0]);
}
const touch = (a, b) => [0, 1, 2].every((k) => a.lo[k] <= b.hi[k] + TOL && b.lo[k] <= a.hi[k] + TOL);
let bad = 0;
for (const t of process.argv.slice(2).length ? process.argv.slice(2) : ['scout', 'heavy', 'worker', 'glitch']) {
  const kit = JSON.parse(fs.readFileSync(`public/robot/${t}/kit.json`, 'utf8')), groups = readGLB(`public/robot/${t}/parts.glb`), W = boneWorld(t);
  const box = (g, m) => { const [, , bone] = g.name.split('__'), o = W(bone); return { n: `${g.name}/${m.name}`, lo: m.lo.map((v, k) => v + o[k]), hi: m.hi.map((v, k) => v + o[k]) }; };
  const bodyB = groups.filter((g) => g.name.startsWith('body__')).flatMap((g) => g.meshes.map((m) => box(g, m)));
  for (const slot of Object.keys(kit.slots)) for (const opt of kit.slots[slot]) {
    const mine = groups.filter((g) => g.name.startsWith(`${slot}__${opt}__`)).flatMap((g) => g.meshes.map((m) => box(g, m)));
    const all = [...bodyB, ...mine], seen = new Set(bodyB.map((b) => b.n)); let grew = true;
    while (grew) { grew = false; for (const m of mine) if (!seen.has(m.n) && all.some((o) => seen.has(o.n) && touch(m, o))) { seen.add(m.n); grew = true; } }
    const fl = mine.filter((m) => !seen.has(m.n) && !(allow[t] || []).includes(m.n));
    if (fl.length) { bad += fl.length; console.log(`${t} ${slot}:${opt} FLOATING ${fl.length}/${mine.length}: ${fl.slice(0, 8).map((m) => m.n.split('__').slice(2).join('__')).join(', ')}`); }
  }
}
console.log(bad ? `${bad} floating parts` : 'no floating parts'); process.exit(bad ? 1 : 0);
