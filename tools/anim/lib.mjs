// Mocap reading + retarget helpers. Positions-first: every source (CMU BVH, Mixamo FBX) is reduced to world joint positions per frame,
// then retargeted by bone DIRECTION to our rig (swing only), so the different rest poses (T-pose vs arms-down, straight vs digitigrade legs) don't matter.
import fs from 'fs';
export const J = ['Hips', 'Neck', 'Head', 'LUp', 'LKnee', 'LFoot', 'LToe', 'RUp', 'RKnee', 'RFoot', 'RToe', 'LArm', 'LElbow', 'LHand', 'RArm', 'RElbow', 'RHand'];
const BVH = { Hips: 'Hips', Neck: 'Neck', Head: 'Head', LUp: 'LeftUpLeg', LKnee: 'LeftLeg', LFoot: 'LeftFoot', LToe: 'LeftToeBase', RUp: 'RightUpLeg', RKnee: 'RightLeg', RFoot: 'RightFoot', RToe: 'RightToeBase', LArm: 'LeftArm', LElbow: 'LeftForeArm', LHand: 'LeftHand', RArm: 'RightArm', RElbow: 'RightForeArm', RHand: 'RightHand' };
export const MIXAMO = Object.fromEntries(Object.entries({ Hips: 'Hips', Neck: 'Neck', Head: 'Head', LUp: 'LeftUpLeg', LKnee: 'LeftLeg', LFoot: 'LeftFoot', LToe: 'LeftToeBase', RUp: 'RightUpLeg', RKnee: 'RightLeg', RFoot: 'RightFoot', RToe: 'RightToeBase', LArm: 'LeftArm', LElbow: 'LeftForeArm', LHand: 'LeftHand', RArm: 'RightArm', RElbow: 'RightForeArm', RHand: 'RightHand' }).map(([k, v]) => [k, 'mixamorig' + v]));

// ---- 3x3 / vec helpers (column vectors)
const rx = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)], ry = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)], rz = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const mm = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = (a) => Math.hypot(...a), norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** CMU BVH → { fps, frames: [ {joint: [x,y,z]} ] } world positions (frame 0 is CMU's added T-pose). */
export function readBVH(file) {
  const txt = fs.readFileSync(file, 'utf8'), [hier, motion] = txt.split(/MOTION/);
  const toks = hier.split(/\s+/).filter(Boolean); const joints = []; const stack = []; let i = 0, cur = null;
  while (i < toks.length) {
    const t = toks[i];
    if (t === 'ROOT' || t === 'JOINT') { cur = { name: toks[i + 1], parent: stack.at(-1) ?? null, offset: [0, 0, 0], ch: [] }; joints.push(cur); i += 2; }
    else if (t === 'End') { i += 2; stack.push(null); cur = { name: '__end', parent: null, offset: [0, 0, 0], ch: [], end: true }; }
    else if (t === 'OFFSET') { if (!cur.end) cur.offset = [+toks[i + 1], +toks[i + 2], +toks[i + 3]]; i += 4; }
    else if (t === 'CHANNELS') { const n = +toks[i + 1]; cur.ch = toks.slice(i + 2, i + 2 + n); i += 2 + n; }
    else if (t === '{') { if (!cur.end) stack.push(cur); i++; }
    else if (t === '}') { stack.pop(); i++; }
    else i++;
  }
  const lines = motion.trim().split('\n'), nFrames = +/Frames:\s*(\d+)/.exec(lines[0])[1], dt = +/Frame Time:\s*([\d.]+)/.exec(lines[1])[1];
  const rows = lines.slice(2).filter((l) => l.trim()).map((l) => l.trim().split(/\s+/).map(Number));
  const frames = [];
  for (const row of rows.slice(0, nFrames)) {
    let k = 0; const W = new Map(); const out = {};
    for (const j of joints) {
      let pos = j.offset, R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (const c of j.ch) { const v = row[k++]; if (c === 'Xposition') pos = [v, pos[1], pos[2]]; else if (c === 'Yposition') pos = [pos[0], v, pos[2]]; else if (c === 'Zposition') pos = [pos[0], pos[1], v];
        else { const a = v * Math.PI / 180; R = mm(R, c === 'Xrotation' ? rx(a) : c === 'Yrotation' ? ry(a) : rz(a)); } }
      const P = j.parent ? W.get(j.parent.name) : { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0] };
      W.set(j.name, { R: mm(P.R, R), p: add(P.p, mv(P.R, pos)) });
    }
    for (const [k2, v] of Object.entries(BVH)) out[k2] = W.get(v)?.p; frames.push(out);
  }
  return { fps: 1 / dt, frames };
}

/** Mixamo FBX → same format, sampled at `fps` over the clip. FBXLoader parses binary FBX in node; animation via AnimationMixer. */
export async function readFBX(file, fps = 30) {
  const THREE = await import('three'); const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const buf = fs.readFileSync(file), g = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''), clip = g.animations[0];
  const bones = new Map(); g.traverse((o) => o.isBone && bones.set(o.name, o)); const mixer = new THREE.AnimationMixer(g); mixer.clipAction(clip).play();
  const frames = [], n = Math.floor(clip.duration * fps), v = new THREE.Vector3();
  for (let f = 0; f < n; f++) { mixer.setTime(f / fps); g.updateMatrixWorld(true); const out = {}; for (const [k, name] of Object.entries(MIXAMO)) out[k] = bones.get(name).getWorldPosition(v).toArray(); frames.push(out); }
  return { fps, frames, duration: clip.duration };
}

/** Frame-0 "reference": CMU files start with a T-pose; for FBX we use the mixer at t=0 only as a fallback for the foot direction. */
export function resample(src, fps) {
  const n = Math.floor((src.frames.length - 1) / (src.fps / fps)) + 1, out = [];
  for (let i = 0; i < n; i++) out.push(src.frames[Math.min(src.frames.length - 1, Math.round(i * src.fps / fps))]);
  return { fps, frames: out };
}
