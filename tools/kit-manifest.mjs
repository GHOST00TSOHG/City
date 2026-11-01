// Kit manifest: the list of parts a robot is SUPPOSED to have. Written from a freshly exported kit, checked in CI and by the loader.
//   node tools/kit-manifest.mjs write [types...]   → public/robot/<type>/manifest.json (run after every Blender --kit export, review the diff)
//   node tools/kit-manifest.mjs verify [types...]  → exit 1 when parts.glb disagrees with the manifest / rig / kit.json
// Replaces the old strip / drop / rebase patch-ups: a bad export now FAILS here instead of being silently cut.
import fs from 'fs';
const TYPES = ['scout', 'heavy', 'worker', 'glitch'], vol = (b) => b.sz[0] * b.sz[1] * b.sz[2];
const REGIONS = new Set(['shell', 'joints', 'torso', 'shorts', 'backpack', 'visor', 'decalColor', 'screen', 'decal', 'chrome', 'rubber', 'glass']);

const mulM = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
/** Parts of every top-level `<slot>__<opt>__<bone>` group. lo/hi/sz are in BONE-LOCAL space exactly as kit.ts applies it
 *  (inverse(group world) x mesh world), so they are directly comparable with the rig. */
export function readGLB(file) {
  const buf = fs.readFileSync(file), jl = buf.readUInt32LE(12), j = JSON.parse(buf.slice(20, 20 + jl).toString());
  const groups = [];
  for (const gi of j.scenes[j.scene ?? 0].nodes) {
    const g = j.nodes[gi], meshes = [];
    const gw = trs(g), inv = [...gw]; // group world is a pure translation in every shipped kit; invert it generally for TRS without scale/rotation
    if (g.rotation || g.scale || g.matrix) console.warn('group has rotation/scale/matrix:', g.name);
    inv[12] = -gw[12]; inv[13] = -gw[13]; inv[14] = -gw[14];
    const walk = (i, parentW) => {
      const n = j.nodes[i], w = mulM(parentW, trs(n));
      if (n.mesh !== undefined) {
        const m = j.meshes[n.mesh], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; let tris = 0; const mats = new Set(); const L = mulM(inv, w);
        for (const p of m.primitives) {
          const pa = j.accessors[p.attributes.POSITION]; tris += (p.indices !== undefined ? j.accessors[p.indices].count : pa.count) / 3;
          mats.add((j.materials?.[p.material]?.name ?? 'shell').replace(/\.\d+$/, ''));
          for (let c = 0; c < 8; c++) { const v = [c & 1 ? pa.max[0] : pa.min[0], c & 2 ? pa.max[1] : pa.min[1], c & 4 ? pa.max[2] : pa.min[2]];
            for (let k = 0; k < 3; k++) { const t = L[k] * v[0] + L[4 + k] * v[1] + L[8 + k] * v[2] + L[12 + k]; mn[k] = Math.min(mn[k], t); mx[k] = Math.max(mx[k], t); } }
        }
        meshes.push({ name: n.name, material: [...mats][0], tris, sz: [0, 1, 2].map((k) => mx[k] - mn[k]), lo: mn, hi: mx });
      }
      (n.children || []).forEach((c) => walk(c, w));
    };
    for (const c of g.children || []) walk(c, gw);
    if (g.mesh !== undefined) walk(gi, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    groups.push({ name: g.name, meshes });
  }
  return groups;
}
const skel = JSON.parse(fs.readFileSync('src/robot/skeleton.json', 'utf8'));
const rigBones = (t) => { const s = new Set(); for (const b of Object.keys(skel[t].bones)) { s.add(b); if (b.startsWith('Left')) s.add(b.replace('Left', 'Right')); } return s; };

export function manifestOf(t) {
  const kit = JSON.parse(fs.readFileSync(`public/robot/${t}/kit.json`, 'utf8'));
  const nodes = readGLB(`public/robot/${t}/parts.glb`).map((g) => { const [slot, opt, bone] = g.name.split('__');
    return { name: g.name, slot, opt, bone, meshes: g.meshes.map((m) => ({ name: m.name, region: m.material, tris: m.tris })) }; });
  return { type: t, version: 1, slots: kit.slots, tris: nodes.reduce((a, n) => a + n.meshes.reduce((b, m) => b + m.tris, 0), 0), nodes };
}

/** Returns a list of problems (empty = OK). */
export function verifyKit(t) {
  const P = [], man = JSON.parse(fs.readFileSync(`public/robot/${t}/manifest.json`, 'utf8')), kit = JSON.parse(fs.readFileSync(`public/robot/${t}/kit.json`, 'utf8'));
  const groups = readGLB(`public/robot/${t}/parts.glb`), byName = new Map(groups.map((g) => [g.name, g])), bones = rigBones(t);
  const pist = new Set((kit.pistons || []).flatMap((p) => [p.objA, p.objB]));
  for (const n of man.nodes) {
    const g = byName.get(n.name); if (!g) { P.push(`missing node ${n.name}`); continue; }
    const have = new Map(g.meshes.map((m) => [m.name, m]));
    for (const m of n.meshes) { const h = have.get(m.name); if (!h) P.push(`missing mesh ${n.name}/${m.name} (${m.tris} tris)`); else if (h.tris < m.tris) P.push(`cut mesh ${n.name}/${m.name}: ${m.tris} -> ${h.tris} tris`); }
  }
  for (const g of groups) {
    const [slot, opt, bone] = g.name.split('__');
    if (!bone) { P.push(`top-level node ${g.name} is not <slot>__<opt>__<bone> (the loader ignores it)`); continue; }
    if (!bones.has(bone) && !pist.has(bone)) P.push(`${g.name}: bone ${bone} is not in the rig (the loader would drop the part)`);
    if (slot !== 'body' && !(kit.slots[slot] || []).includes(opt)) P.push(`${g.name}: option ${opt} is not in kit.json slots`);
    if (!man.nodes.some((n) => n.name === g.name)) P.push(`node ${g.name} is not in manifest.json (re-run write after reviewing)`);
    const base = new Map(g.meshes.filter((m) => !/\.\d{3}$/.test(m.name)).map((m) => [m.name, m]));
    for (const m of g.meshes) {
      if (!(m.tris > 0)) P.push(`${g.name}/${m.name}: zero triangles`);
      if (!REGIONS.has(m.material)) P.push(`${g.name}/${m.name}: material "${m.material}" is not a kit region (would fall back to shell)`);
      const b = /^(.*)\.\d{3}$/.exec(m.name) && base.get(/^(.*)\.\d{3}$/.exec(m.name)[1]);   // boolean-slice remnant: a `<part>.NNN` far bigger than its base part
      if (b && vol(m) > 3 * vol(b) && vol(m) > 0.002) P.push(`${g.name}/${m.name}: looks like a boolean-slice remnant (${vol(m).toFixed(3)} m3 vs ${vol(b).toFixed(3)} m3 base). Fix the exporter, do not strip`);
      if (Math.max(...m.sz) > 3) P.push(`${g.name}/${m.name}: bbox ${m.sz.map((v) => v.toFixed(1))} m is bigger than the robot`);
    }
  }
  // FEET: both feet exist, are mirror images, touch the ground at the rig's rest pose, and the thruster sole offset matches the real sole
  { const L = groups.find((g) => g.name === 'body__base__LeftFoot'), R = groups.find((g) => g.name === 'body__base__RightFoot');
    if (!L || !R) P.push('feet: body__base__LeftFoot / RightFoot group missing');
    else {
      const stat = (g) => ({ tris: g.meshes.reduce((a, m) => a + m.tris, 0), lo: Math.min(...g.meshes.map((m) => m.lo[1])), zlo: Math.min(...g.meshes.map((m) => m.lo[2])), zhi: Math.max(...g.meshes.map((m) => m.hi[2])) });
      const l = stat(L), r = stat(R);
      if (!(l.tris > 0 && r.tris > 0)) P.push(`feet: zero triangles (L ${l.tris}, R ${r.tris})`);
      if (Math.abs(l.tris - r.tris) > 0.05 * Math.max(l.tris, r.tris)) P.push(`feet: left/right differ (${l.tris} vs ${r.tris} tris): one foot is damaged or cut`);
      if (Math.abs(l.lo - r.lo) > 0.005) P.push(`feet: soles at different heights (${l.lo.toFixed(3)} vs ${r.lo.toFixed(3)})`);
      const b = skel[t].bones, rest = b.Hips[1] + b.LeftUpLeg[1] + b.LeftLeg[1] + b.LeftFoot[1];
      if (Math.abs(rest + l.lo) > 0.01) P.push(`feet: rest pose ${rest > -l.lo ? 'floats' : 'sinks'} ${Math.abs(rest + l.lo).toFixed(3)} m (foot bone ${rest.toFixed(3)} m high, real sole ${l.lo.toFixed(3)})`);
      const ts = fs.readFileSync('src/robot/types.ts', 'utf8'), blk = ts.slice(ts.indexOf(`label: '${t[0].toUpperCase() + t.slice(1)}'`)), sole = +/sole: (-?[\d.]+)/.exec(blk)[1], sz = +(/soleZ: (-?[\d.]+)/.exec(blk.slice(0, 400))?.[1] ?? -0.03);
      if (Math.abs(sole - l.lo) > 0.02) P.push(`feet: types.ts sole ${sole} does not match the real foot bottom ${l.lo.toFixed(3)} (thrusters would not sit on the sole)`);
      if (t !== 'worker' && (sz < l.zlo - 0.02 || sz > l.zhi + 0.02)) P.push(`feet: thruster soleZ ${sz} is outside the foot (${l.zlo.toFixed(2)}..${l.zhi.toFixed(2)})`);
    } }
  for (const s of Object.keys(kit.slots)) for (const o of kit.slots[s]) if (!groups.some((g) => g.name.startsWith(`${s}__${o}__`) && g.meshes.some((m) => m.tris > 0))) P.push(`slot option ${s}:${o} has no geometry`);
  if (!groups.some((g) => g.name.startsWith('body__base__') && g.meshes.some((m) => m.tris > 0))) P.push('no body__base__* geometry');
  return P;
}
if (process.argv[1].endsWith('kit-manifest.mjs')) {
  const [cmd, ...ts] = process.argv.slice(2), list = ts.length ? ts : TYPES; let bad = 0;
  for (const t of list) {
    if (cmd === 'write') { fs.writeFileSync(`public/robot/${t}/manifest.json`, JSON.stringify(manifestOf(t))); console.log('wrote', t, manifestOf(t).nodes.length, 'nodes', manifestOf(t).tris, 'tris'); }
    else { const p = verifyKit(t); console.log(p.length ? 'FAIL' : 'PASS', t, p.length ? '\n  ' + p.join('\n  ') : ''); bad += p.length; }
  }
  process.exit(bad ? 1 : 0);
}
