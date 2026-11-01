// Bake retargeted mocap into public/robot/anim/clips.json (rig-independent local quaternions for our 13 pose bones + hip bob + speed).
//   node tools/anim/bake.mjs [--diag]        sources are read IN PLACE (~/Downloads Mixamo FBX, ~/builds/mocap-raw CMU BVH); only the baked result is written.
// Licences: docs/ANIM-SOURCES.md. Mixamo raw FBX are never copied into the repo (Adobe forbids redistributing the raw files); CMU data is free incl. commercial.
import fs from 'fs'; import os from 'os';
import { readBVH, readFBX, resample, sub, add, dot, cross, len, norm } from './lib.mjs';
const HOME = os.homedir(), BVHD = `${HOME}/builds/mocap-raw/bvh/`, FBXD = `${HOME}/Downloads/`, FPS = 30, DIAG = process.argv.includes('--diag');
// id: { src, kind, loop, a, b (frame range at 30 fps, optional), ref: 'mean' | 'first' }
const CLIPS = JSON.parse(fs.readFileSync(new URL('./clips.config.json', import.meta.url)));

// ---- quaternion helpers [x,y,z,w]
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qfrom = (a, b) => { const d = dot(a, b); if (d < -0.999999) { const ax = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]); const n = norm(ax); return [n[0], n[1], n[2], 0]; } const c = cross(a, b), q = [c[0], c[1], c[2], 1 + d], l = Math.hypot(...q); return q.map((v) => v / l); };
const qmat = (x, y, z) => { // columns x,y,z -> quaternion
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2], t = m00 + m11 + m22; let q;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  return q;
};
const qslerp = (a, b, t) => { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = b.map((v) => -v); d = -d; } if (d > 0.9995) { const r = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...r); return r.map((v) => v / l); } const th = Math.acos(d), s = Math.sin(th); const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s; return a.map((v, i) => v * wa + b[i] * wb); };
const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const DOWN = [0, -1, 0], UP = [0, 1, 0], FOOT_REF = norm([0, -0.3, 1]);

function pelvis(f) { const x = norm(sub(f.LUp, f.RUp)), u = sub(f.Neck, f.Hips), y = norm(sub(u, x.map((v) => v * dot(u, x)))), z = cross(x, y); return { x, y, z }; }

function retarget(frames, refMode) {
  // heading: mean pelvis facing, removed so every clip walks along +Z
  let sx = 0, sz = 0; for (const f of frames) { const p = pelvis(f); sx += p.z[0]; sz += p.z[2]; } const yaw = Math.atan2(sx, sz);
  const F = frames.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, rotY(v, -yaw)])));
  const legL = (() => { const xs = F.map((f) => f.Hips[1] - Math.min(f.LFoot[1], f.RFoot[1])).sort((a, b) => a - b); return xs[Math.floor(xs.length * 0.9)]; })();
  const hy = F.map((f) => f.Hips[1]), hy0 = refMode === 'first' ? hy.slice(0, 3).reduce((a, b) => a + b) / 3 : hy.reduce((a, b) => a + b) / hy.length;
  const out = { bob: [], q: {} }; const names = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']; for (const n of names) out.q[n] = [];
  for (let i = 0; i < F.length; i++) {
    const f = F[i], p = pelvis(f), Wh = qmat(p.x, p.y, p.z), Wsp = qfrom(UP, norm(sub(f.Neck, f.Hips))), Whd = qfrom(UP, norm(sub(f.Head, f.Neck)));
    const push = (n, q) => out.q[n].push(q);
    push('Hips', Wh); push('Spine', qmul(qinv(Wh), Wsp)); push('Head', qmul(qinv(Wsp), Whd));
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'Left' : 'Right', Wa = qfrom(DOWN, norm(sub(f[s + 'Elbow'], f[s + 'Arm']))), Wf = qfrom(DOWN, norm(sub(f[s + 'Hand'], f[s + 'Elbow'])));
      push(side + 'Arm', qmul(qinv(Wsp), Wa)); push(side + 'ForeArm', qmul(qinv(Wa), Wf));
      const Wu = qfrom(DOWN, norm(sub(f[s + 'Knee'], f[s + 'Up']))), Wl = qfrom(DOWN, norm(sub(f[s + 'Foot'], f[s + 'Knee']))), Wt = qfrom(FOOT_REF, norm(sub(f[s + 'Toe'], f[s + 'Foot'])));
      push(side + 'UpLeg', qmul(qinv(Wh), Wu)); push(side + 'Leg', qmul(qinv(Wu), Wl)); push(side + 'Foot', qmul(qinv(Wl), Wt));
    }
    out.bob.push((hy[i] - hy0) / legL);
  }
  const d = sub(F.at(-1).Hips, F[0].Hips); out.travel = Math.hypot(d[0], d[2]) / legL; out.legL = legL;
  out.footY = F.map((f) => [(f.LFoot[1] - Math.min(f.LFoot[1], f.RFoot[1])) / legL, (f.RFoot[1] - Math.min(f.LFoot[1], f.RFoot[1])) / legL]);
  out.hipsY = hy.map((v) => v / legL); out.lz = F.map((f) => f.LFoot[2] - f.Hips[2]);
  return out;
}

const outClips = {}, srcs = {};
for (const c of CLIPS) {
  const key = c.src; if (!srcs[key]) srcs[key] = c.kind === 'bvh' ? resample(readBVH(BVHD + c.src), FPS) : await readFBX(FBXD + c.src, FPS);
  let frames = srcs[key].frames.slice(c.kind === 'bvh' ? 1 : 0); // BVH frame 0 is the added T-pose
  if (c.a !== undefined) frames = frames.slice(c.a, c.b);
  if (DIAG) { const r = retarget(frames, c.ref ?? 'mean'); console.log(c.id, c.src, 'frames', frames.length, 'legL', r.legL.toFixed(1), 'travel legs', r.travel.toFixed(2)); console.log('  hipsY/leg', r.hipsY.filter((_, i) => i % 5 === 0).map((v) => v.toFixed(2)).join(' ')); console.log('  footL', r.footY.filter((_, i) => i % 5 === 0).map((v) => v[0].toFixed(2)).join(' ')); continue; }
  let r = retarget(frames, c.ref ?? 'mean'), N = frames.length;
  if (c.loop) { // find the gait period: pose at t0 equals pose at t0+P (min distance over quats), then crossfade the tail into the head
    const t0 = c.t0 ?? 2, names = Object.keys(r.q), dist = (i, j) => names.reduce((s, n) => s + 1 - Math.abs(r.q[n][i].reduce((a, v, k) => a + v * r.q[n][j][k], 0)), 0);
    let best = null; for (let P = Math.round(c.minP * FPS); P <= Math.min(Math.round(c.maxP * FPS), N - t0 - 1); P++) { const d = dist(t0, t0 + P) + 0.5 * dist(t0 + 1, t0 + P + 1); if (!best || d < best.d) best = { P, d }; }
    const P = best.P; const q = {}, bob = [];
    for (const n of Object.keys(r.q)) q[n] = r.q[n].slice(t0, t0 + P); // pose(t0+P) ~ pose(t0): the wrap is the seam (distance reported as `seam`)
    for (let i = 0; i < P; i++) bob.push(r.bob[t0 + i]);
    // rotate the cycle so frame 0 is LEFT HEEL STRIKE (left foot furthest forward of the hips): every locomotion clip then shares the same phase,
    // so walk <-> run crossfades keep the feet in step
    let k0 = 0; for (let i = 1; i < P; i++) if (r.lz[t0 + i] > r.lz[t0 + k0]) k0 = i;
    for (const n of Object.keys(q)) q[n] = [...q[n].slice(k0), ...q[n].slice(0, k0)]; const bob2 = [...bob.slice(k0), ...bob.slice(0, k0)]; bob.length = 0; bob.push(...bob2);
    const seam = best.d; r = { ...r, q, bob, travel: (() => { const d = sub(frames[t0 + P].Hips, frames[t0].Hips); return Math.hypot(d[0], d[2]) / r.legL; })(), seam }; N = P;
  }
  const speed = c.loop ? r.travel / (N / FPS) : 0; // legs per second
  const q = {}; for (const [n, arr] of Object.entries(r.q)) q[n] = arr.flatMap((v) => v.map((x) => +x.toFixed(4)));
  outClips[c.id] = { fps: FPS, n: N, loop: !!c.loop, speed: +speed.toFixed(3), bob: r.bob.slice(0, N).map((v) => +v.toFixed(4)), q, src: c.src, seam: r.seam !== undefined ? +r.seam.toFixed(4) : undefined };
  console.log('baked', c.id, c.src, 'frames', N, (N / FPS).toFixed(2) + 's', 'speed legs/s', speed.toFixed(2), r.seam !== undefined ? 'seam ' + r.seam.toFixed(3) : '');
}
if (!DIAG) { fs.mkdirSync('public/robot/anim', { recursive: true }); fs.writeFileSync('public/robot/anim/clips.json', JSON.stringify(outClips)); console.log('wrote public/robot/anim/clips.json', (fs.statSync('public/robot/anim/clips.json').size / 1024).toFixed(1) + ' KB'); }
