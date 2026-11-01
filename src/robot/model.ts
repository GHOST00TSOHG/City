import * as THREE from 'three/webgpu';
import { clips, sampleQ, sampleBob, POSE_BONES } from './clips';
import { TYPES, defaultSlots, sanitizeSlots, type RobotType, type Slot as TSlot } from './types';

/** Colour regions a player can customise later (join screen). Keys are stable: saved looks depend on them. */
export interface RobotLook {
  shell: string; joints: string; torso: string; shorts: string; backpack: string; visor: string; decalColor: string;
  helmet: string; arms: string; bionics: string; legs: string; thrusters: string; boots: string;
}
/** Slots per robot type live in ./types (TYPES[type].slots); the look carries the active type's build. */
export const SLOTS = TYPES.scout.slots;
export type Slot = TSlot;
export const DEFAULT_LOOK: RobotLook = { ...TYPES.scout.paint, ...defaultSlots('scout') };
export const REGIONS = ['shell', 'joints', 'torso', 'shorts', 'backpack', 'visor', 'decalColor'] as const;
/** Merge a saved look over the type's defaults, dropping unknown values (old saves, hand edits, other types' parts). */
export function sanitizeLook(raw: unknown, type: RobotType = 'scout'): RobotLook {
  const out: RobotLook = { ...TYPES[type].paint, ...defaultSlots(type) }, r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const k of REGIONS) if (typeof r[k] === 'string' && /^#[0-9a-f]{6}$/i.test(r[k] as string)) (out as any)[k] = r[k];
  Object.assign(out, sanitizeSlots(r, type));
  return out;
}
type Region = (typeof REGIONS)[number];

/** Animation states the controller drives. A GLB with clips named like these uses them; otherwise poses are procedural. */
export type RobotAnim = 'idle' | 'walk' | 'run' | 'jump' | 'hover' | 'fly' | 'fall' | 'land' | 'roll' | 'stumble';

/** Everything the rest of the game may touch on a robot. Swap the implementation, keep this interface. */
export interface RobotModel {
  root: THREE.Object3D;
  /** Boot nozzle empties (world flames and lights follow these). */
  nozzles: THREE.Object3D[];
  height: number;
  setLook(look: Partial<RobotLook>): void;
  /** k = 0..1 blend weights / phase are computed by the controller; model just poses itself. */
  animate(s: PoseInput, dt: number): void;
  dispose(): void;
}
export interface PoseInput { anim: RobotAnim; phase: number; speed: number; lean: number; bank: number; crouch: number; t: number; fist?: number; special?: number; damage?: number;
  /** flight: launch = take-off wind-up 0..1 (crouch), flyT = s since the rockets lit, thrust = throttle 0..1 */
  launch?: number; flyT?: number; thrust?: number;
  /** ground speed m/s (stride-matches the mocap), form = transformation progress 0..1, slide / cloud / vox = style blends 0..1 from the controller */
  gs?: number; slide?: number; vox?: number; form?: number; cloud?: number;
  /** landing by fall speed: kind from types.ts, seconds since touch-down, strength 0..1, planned duration */
  landKind?: LandKind; landT?: number; landS?: number; landDur?: number }
export type LandKind = 'none' | 'slam' | 'knee' | 'quad' | 'voxel';
/** Which baked mocap drives walking / running for this type and how hard it is pushed (types.ts TYPES[t].gait). amp scales the swing around rest. */
export interface GaitProfile { wMoc: number; idleW: number; landW: number; maxRate: number; amp: { arms: number; legs: number; spine: number }; bob: number }
export const DEFAULT_GAIT: GaitProfile = { wMoc: 0.9, idleW: 0.3, landW: 0.4, maxRate: 2.2, amp: { arms: 1, legs: 1, spine: 1 }, bob: 1 };
/** Per-type body mechanics (types.ts TYPES[t].motion). mass slows blends and deepens the plant; sway = hip roll; limp = right-leg hitch. */
export interface MotionProfile { mass: number; bob: number; sway: number; stride: number; arms: number; limp: number; hunch: number; curl: number; special: 'none' | 'groundpound' | 'blinkdash' }
export const DEFAULT_MOTION: MotionProfile = { mass: 1, bob: 1, sway: 1, stride: 1, arms: 1, limp: 0, hunch: 0, curl: 0.35, special: 'none' };

/** Bones by Mixamo-style names so Jonn's rig and the placeholder share one pose code path. */
export const BONES = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'] as const;
export type Bones = Partial<Record<(typeof BONES)[number], THREE.Object3D>> & Record<string, THREE.Object3D | undefined>;

/** Procedural pose: Euler targets (x pitch, z roll) per bone; damped so state changes blend. */
export type FlightStyle = 'scout' | 'heavy' | 'medic' | 'cubes' | 'generic';
export function makePoser(b: Bones, M: MotionProfile = DEFAULT_MOTION, style: FlightStyle = 'generic', G: GaitProfile = DEFAULT_GAIT) {
  const fingers = Object.keys(b).filter((n) => /^(Left|Right)F\d_\d$/.test(n)) as (keyof Bones)[];
  let fistC = 0, openC = 0;
  const rest = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const o of Object.values(b)) if (o) rest.set(o, o.quaternion.clone());
  const cur = new Map<string, THREE.Vector3>(); const q = new THREE.Quaternion(), e = new THREE.Euler();
  const set = (name: keyof Bones, x: number, y: number, z: number, k: number) => {
    const o = b[name]; if (!o) return;
    let v = cur.get(name); if (!v) cur.set(name, (v = new THREE.Vector3()));
    v.x += (x - v.x) * k; v.y += (y - v.y) * k; v.z += (z - v.z) * k;
    o.quaternion.copy(rest.get(o)!).multiply(q.setFromEuler(e.set(v.x, v.y, v.z)));
  };
  let hipY = 0;
  // ---- mocap layer (clips.ts): walking / running / idle / landing are sampled from baked CMU + Mixamo data and blended over the procedural pose
  const legL = Math.abs((b.LeftUpLeg?.position.y ?? -0.4) + (b.LeftLeg?.position.y ?? -0.4) + (b.LeftFoot?.position.y ?? -0.3)) || 0.75;
  let mc = 0, u = 0, uIdle = 0; const qm = new THREE.Quaternion(), qt = new THREE.Quaternion(), qs = new THREE.Quaternion(), qi = new THREE.Quaternion(), eo = new THREE.Euler();
  const sstep = (x: number, a: number, c: number) => { const t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
  const grp = (n: string) => (n.includes('Arm') ? G.amp.arms : /Leg|Foot/.test(n) ? G.amp.legs : G.amp.spine);
  const FOLD = ['Spine', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'];
  const ovr = (name: string, x: number, y: number, z: number, w: number, order: 'XYZ' | 'YXZ' = 'XYZ') => { const o = b[name]; if (!o || w <= 0.001) return; eo.set(x, y, z, order); qt.copy(rest.get(o)!).multiply(qs.setFromEuler(eo)); o.quaternion.slerp(qt, Math.min(1, w)); };
  function mocap(p: PoseInput, dt: number) {
    const C = clips(); if (!C) return 0;
    const loc = (p.anim === 'walk' || p.anim === 'run') && !p.landKind, gs = p.gs ?? 0;
    const landing = p.anim === 'land' && p.landKind && p.landKind !== 'none' && p.landKind !== 'voxel' && !!C.jump_a;
    mc += ((loc ? G.wMoc : landing ? G.landW : p.anim === 'idle' ? G.idleW : 0) - mc) * (1 - Math.exp(-dt * 9));
    if (mc < 0.01) return 0;
    let bobM = 0;
    if (loc) {
      const S = C.walk_a, Jg = C.jog_a, R = C.run_a; if (!S || !Jg || !R) return 0;
      const wS = 1 - sstep(gs, 1.2, 2.6), wR = sstep(gs, 4.2, 6.4), wJ = Math.max(0, 1 - wS - wR);
      const rate = (c: typeof S, lo: number, hi: number) => Math.max(lo, Math.min(hi, gs / (Math.max(0.2, c.speed) * legL)));
      const rS = rate(S, 0.5, 2.0), rJ = rate(Jg, 0.6, 1.9), rR = rate(R, 0.7, G.maxRate);
      u = (u + dt * (rS * S.fps / S.n * wS + rJ * Jg.fps / Jg.n * wJ + rR * R.fps / R.n * wR)) % 1;
      const ex = 1 + 0.22 * Math.max(0, rR - 1) * wR; // faster than the capture: swing a little wider so the strides keep up
      for (const n of POSE_BONES) {
        const o = b[n]; if (!o) continue;
        sampleQ(S, n, u * S.n, qm); sampleQ(Jg, n, u * Jg.n, qi); qm.slerp(qi, wJ / Math.max(1e-4, wS + wJ)); sampleQ(R, n, u * R.n, qi); qm.slerp(qi, wR);
        const a = grp(n) * (/Leg|Foot/.test(n) ? ex : 1); if (a !== 1) { qi.identity(); qm.copy(qi.slerp(qm, a)); }
        o.quaternion.slerp(qm, mc);
      }
      bobM = (sampleBob(S, u * S.n) * wS + sampleBob(Jg, u * Jg.n) * wJ + sampleBob(R, u * R.n) * wR) * legL * G.bob;
    } else if (landing) {
      const c = C.jump_a, f = 44 + Math.min(1, Math.max(0, (p.landT ?? 0) / Math.max(0.2, p.landDur ?? 0.8))) * 22; // the capture's own landing: frames 44..66
      for (const n of POSE_BONES) { const o = b[n]; if (!o || n === 'Hips') continue; sampleQ(c, n, f, qm); o.quaternion.slerp(qm, mc); }
      bobM = sampleBob(c, f) * legL * (p.landS ?? 0.5);
    } else { // idle: Mixamo "Warrior Idle" breathing / weight shift on the upper body only (feet stay planted)
      const c = C.idle_a; if (!c) return 0; uIdle = (uIdle + dt * c.fps / c.n) % 1;
      for (const n of ['Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'] as const) { const o = b[n]; if (!o) continue; sampleQ(c, n, uIdle * c.n, qm); o.quaternion.slerp(qm, mc); }
    }
    return bobM * mc;
  }
  return (p: PoseInput, dt: number) => {
    const k = 1 - Math.exp(-dt * (p.anim === 'roll' ? 30 : 12) / Math.sqrt(M.mass)), s = Math.sin(p.phase), c = Math.cos(p.phase);
    let hips = [0, 0, 0], spine = [0, 0, 0], head = [0, 0, 0], la = [0, 0, 0.12], ra = [0, 0, -0.12], lf = [0, 0, 0], rf = [0, 0, 0];
    let lu = [0, 0, 0], ru = [0, 0, 0], ll = [0, 0, 0], rl = [0, 0, 0], lft = [0, 0, 0], rft = [0, 0, 0], bob = 0;
    const breathe = Math.sin(p.t * 2.2) * 0.03;
    switch (p.anim) {
      case 'idle': spine = [breathe, 0, 0]; la = [0.05, 0, 0.14 + breathe]; ra = [0.05, 0, -0.14 - breathe]; lf = [-0.25, 0, 0]; rf = [-0.25, 0, 0]; break;
      case 'walk': case 'run': { // bouncy, big arm swing (reference 0:43)
        const run = p.anim === 'run' ? 1 : 0, A = 0.55 + run * 0.35;
        lu = [-s * A, 0, 0]; ru = [s * A, 0, 0]; ll = [Math.max(0, c) * (0.7 + run * 0.6), 0, 0]; rl = [Math.max(0, -c) * (0.7 + run * 0.6), 0, 0];
        la = [s * (0.9 + run * 0.4), 0, 0.15]; ra = [-s * (0.9 + run * 0.4), 0, -0.15]; lf = [-0.5 - run * 0.6, 0, 0]; rf = [-0.5 - run * 0.6, 0, 0];
        spine = [0.08 + run * 0.18, s * 0.12, 0]; head = [-0.05 - run * 0.1, -s * 0.08, 0]; bob = Math.abs(Math.sin(p.phase)) * (0.06 + run * 0.05); break; }
      case 'jump': case 'hover': { // legs dangle, arms out for balance
        const w = Math.sin(p.t * 3) * 0.08;
        lu = [0.15 + w, 0, 0.05]; ru = [-0.05 - w, 0, -0.05]; ll = [0.35, 0, 0]; rl = [0.55, 0, 0];
        la = [0.1, 0, 0.55 + w]; ra = [0.1, 0, -0.55 - w]; lf = [-0.4, 0, 0]; rf = [-0.4, 0, 0]; break; }
      case 'fly': case 'fall': { // head-first superman: body horizontal (lean on root), arms swept back, legs together
        const flap = Math.sin(p.t * 9) * 0.04 * p.speed;
        la = [-0.25 + flap, 0, 0.2]; ra = [-0.25 - flap, 0, -0.2]; lf = [-0.1, 0, 0]; rf = [-0.1, 0, 0];
        if (p.anim === 'fall') { la = [-2.6, 0, 0.5]; ra = [-2.6, 0, -0.5]; lf = [-0.3, 0, 0]; rf = [-0.3, 0, 0]; }
        lu = [0.05, 0, 0.03]; ru = [0.05, 0, -0.03]; ll = [0.25, 0, 0]; rl = [0.12, 0, 0]; head = [-0.9 * p.lean, 0, 0]; break; }
      case 'land': { // knee bend (reference 0:42)
        if (p.landKind && p.landKind !== 'none' && p.landKind !== 'voxel') { // per-type landing, scaled by fall speed (landS) and shaped by landT / landDur
          const uL = Math.min(1, (p.landT ?? 0) / Math.max(0.2, p.landDur ?? 0.8)), S = Math.max(0.35, p.landS ?? 0.5), e = sstep(uL, 0, 0.16) * (1 - sstep(uL, 0.6, 1)) * S, sp2 = sstep(uL, 0.62, 0.8) * (1 - sstep(uL, 0.8, 1));
          if (p.landKind === 'slam') { // Heavy: deep squat, both fists driven into the ground, a hard bounce of the mass
            lu = [-1.2 * e, 0, 0.32 * e]; ru = [-1.2 * e, 0, -0.32 * e]; ll = [1.9 * e, 0, 0]; rl = [1.9 * e, 0, 0]; lft = [-0.5 * e, 0, 0]; rft = lft.slice();
            spine = [0.5 * e, 0, 0]; head = [-0.35 * e, 0, 0]; la = [-0.35 * e, 0, 0.55 * e]; ra = [-0.35 * e, 0, -0.55 * e]; lf = [-0.2 * e, 0, 0]; rf = lf.slice(); bob = -0.5 * e + Math.sin(uL * 26) * 0.03 * Math.max(0, 0.5 - uL) * S;
          } else if (p.landKind === 'knee') { // Scout: one-knee superhero landing, fist braced on the ground, then springs up
            lu = [-1.45 * e, 0, 0.12 * e]; ll = [1.55 * e, 0, 0]; ru = [-0.45 * e, 0, -0.18 * e]; rl = [2.35 * e, 0, 0]; lft = [-0.5 * e, 0, 0]; rft = [0.6 * e, 0, 0];
            spine = [0.62 * e, 0, 0]; head = [-0.55 * e, 0, 0]; la = [-0.15 * e, 0, 0.4 * e]; ra = [0.8 * e, 0, -1.0 * e]; lf = [-0.3 * e, 0, 0]; rf = [-0.4 * e, 0, 0]; bob = -0.52 * e + sp2 * 0.22 * S;
          } else { // quad (Worker): four-limb landing, hydraulic compression rings out
            lu = [-1.35 * e, 0, 0.3 * e]; ru = [-1.35 * e, 0, -0.3 * e]; ll = [2.0 * e, 0, 0]; rl = [2.0 * e, 0, 0]; lft = [-0.6 * e, 0, 0]; rft = lft.slice();
            spine = [1.0 * e, 0, 0]; head = [-0.85 * e, 0, 0]; la = [-1.0 * e, 0, 0.18 * e]; ra = [-1.0 * e, 0, -0.18 * e]; lf = [-0.25 * e, 0, 0]; rf = lf.slice();
            bob = -0.46 * e + Math.sin(uL * 34) * 0.05 * Math.exp(-uL * 4.5) * S;
          }
          break;
        }
        const cr = p.crouch; lu = [-1.0 * cr, 0, 0.08]; ru = [-1.0 * cr, 0, -0.08]; ll = [1.7 * cr, 0, 0]; rl = [1.7 * cr, 0, 0];
        lft = [-0.7 * cr, 0, 0]; rft = [-0.7 * cr, 0, 0]; spine = [0.45 * cr, 0, 0]; la = [-0.4 * cr, 0, 0.5 * cr]; ra = [-0.4 * cr, 0, -0.5 * cr]; bob = -0.32 * cr; break; }
      case 'roll': case 'stumble': // tucked ball; the root does the tumbling
        lu = [-2.0, 0, 0]; ru = [-2.0, 0, 0]; ll = [2.3, 0, 0]; rl = [2.3, 0, 0]; spine = [0.7, 0, 0]; head = [0.4, 0, 0];
        la = [-1.2, 0, 0.3]; ra = [-1.2, 0, -0.3]; lf = [-1.6, 0, 0]; rf = [-1.6, 0, 0]; break;
    }
    // per-type flight: take-off wind-up, hover and cruise poses (generic poses above are the fallback)
    const air = p.anim === 'hover' || p.anim === 'fly', fl = p.flyT ?? 0, th = p.thrust ?? 0;
    let open = 0;
    if ((p.launch ?? 0) > 0) { // crouch-and-launch: Heavy sinks deep and slow, the others dip
      const d = style === 'heavy' ? 1 : style === 'scout' ? 0.45 : 0.6, cr = Math.sin(Math.min(1, p.launch!) * Math.PI * 0.5) * d;
      lu = [-1.0 * cr, 0, 0.12]; ru = [-1.0 * cr, 0, -0.12]; ll = [1.7 * cr, 0, 0]; rl = [1.7 * cr, 0, 0]; lft = [-0.7 * cr, 0, 0]; rft = lft.slice();
      spine = [0.5 * cr, 0, 0]; la = [0.5 * cr, 0, 0.35 * cr + 0.1]; ra = [0.5 * cr, 0, -0.35 * cr - 0.1]; bob = -0.34 * cr;
      if (style === 'medic') open = p.launch!;
    } else if (air && style !== 'generic') {
      const hv = p.anim === 'hover', w = Math.sin(p.t * 2.4), up = Math.max(0, 1 - fl / 0.5); // up = lift-off burst just after launch
      if (style === 'scout') { // agile: leans into it, one knee tucked, arms out like a skier; banks hard
        if (hv) { lu = [-0.5, 0, 0.06]; ru = [0.1, 0, -0.06]; ll = [1.0, 0, 0]; rl = [0.45, 0, 0]; la = [0.25, 0, 0.7 + w * 0.05]; ra = [0.25, 0, -0.7 - w * 0.05]; lf = [-0.5, 0, 0]; rf = [-0.5, 0, 0]; spine = [0.22, 0, 0]; bob = w * 0.03; }
        else { lu = [0.1, 0, 0.04]; ru = [-0.35, 0, -0.04]; ll = [0.3, 0, 0]; rl = [0.8, 0, 0]; la = [0.5, 0, 0.35]; ra = [0.5, 0, -0.35]; lf = [-0.2, 0, 0]; rf = [-0.2, 0, 0]; head = [-0.9 * p.lean, 0, 0]; }
        spine[2] += p.bank * 0.6; head[2] -= p.bank * 0.3; la[2] += p.bank * 0.4; ra[2] += p.bank * 0.4;
        if (up > 0) { lu[0] -= 0.6 * up; ll[0] += 0.9 * up; ru[0] -= 0.6 * up; rl[0] += 0.9 * up; }
      } else if (style === 'heavy') { // weighty: wide stance, knees soft, fists down at the sides; slow heavy bob
        const hb = Math.sin(p.t * 1.5);
        lu = [-0.25, 0, 0.22]; ru = [-0.25, 0, -0.22]; ll = [0.5, 0, 0]; rl = [0.5, 0, 0]; lft = [0.25, 0, 0]; rft = [0.25, 0, 0];
        la = [0.15, 0, 0.45]; ra = [0.15, 0, -0.45]; lf = [-0.55, 0, 0]; rf = [-0.55, 0, 0]; spine = [0.12 + hb * 0.03, 0, 0]; bob = hb * 0.09 - 0.05;
        if (!hv) { la = [-0.4, 0, 0.35]; ra = [-0.4, 0, -0.35]; lf = [-1.1, 0, 0]; rf = [-1.1, 0, 0]; head = [-0.7 * p.lean, 0, 0]; lu = [0.05, 0, 0.18]; ru = [0.05, 0, -0.18]; ll = [0.35, 0, 0]; rl = [0.35, 0, 0]; }
        if (up > 0) { ll[0] += 1.2 * up; rl[0] += 1.2 * up; lu[0] -= 0.7 * up; ru[0] -= 0.7 * up; }
        spine[2] += p.bank * 0.25;
      } else if (style === 'medic') { // upright, steady; hands open, palms down/back firing the green steering jets
        const st = Math.sin(p.t * 1.9) * 0.04;
        lu = [-0.12, 0, 0.06]; ru = [-0.04, 0, -0.06]; ll = [0.35, 0, 0]; rl = [0.25, 0, 0];
        la = [0.45 + st, -0.2, 0.32 - p.bank * 0.4]; ra = [0.45 - st, 0.2, -0.32 - p.bank * 0.4]; lf = [-0.25, 0.9, 0]; rf = [-0.25, -0.9, 0];
        spine = [0.02, 0, 0]; head = [-0.05, 0, 0]; bob = Math.sin(p.t * 1.6) * 0.02;
        if (!hv) { la = [0.9, -0.2, 0.25]; ra = [0.9, 0.2, -0.25]; lf = [-0.1, 0.9, 0]; rf = [-0.1, -0.9, 0]; head = [-0.85 * p.lean, 0, 0]; ll = [0.3, 0, 0]; rl = [0.15, 0, 0]; }
        open = 1;
      } else { // Glitch: streamlined, arms close, legs together; the lower body streams away as cubes (glitch.ts)
        const g = Math.sin(p.t * 2.1) * 0.03;
        lu = [-0.05, 0, 0.02]; ru = [0.02, 0, -0.02]; ll = [0.2, 0, 0]; rl = [0.3, 0, 0]; lft = [0.5, 0, 0]; rft = [0.5, 0, 0];
        la = [0.2, 0, 0.3 + g]; ra = [0.2, 0, -0.3 - g]; lf = [-0.3, 0, 0]; rf = [-0.3, 0, 0]; spine = [0.06, 0, 0]; bob = g;
        if (!hv) { la = [0.35, 0, 0.12]; ra = [0.35, 0, -0.12]; lf = [-0.05, 0, 0]; rf = [-0.05, 0, 0]; head = [-0.9 * p.lean, 0, 0]; }
      }
      void th;
    }
    if (p.anim === 'land' && style === 'heavy') { bob *= 1.25; ll = ll.map((v) => v * 1.1); }
    // per-type mass layer: hip sway + counter-rotation, heel-to-toe roll, limp hitch, hunch, special moves
    const moving = p.anim === 'walk' || p.anim === 'run';
    if (moving) {
      const A = M.stride; lu = lu.map((v, i) => (i ? v : v * A)); ru = ru.map((v, i) => (i ? v : v * A));
      la = [la[0] * M.arms, la[1], la[2]]; ra = [ra[0] * M.arms, ra[1], ra[2]];
      hips = [hips[0], -s * 0.1 * M.sway, c * 0.07 * M.sway]; spine = [spine[0], spine[1] + s * 0.1 * M.sway, spine[2] - c * 0.05 * M.sway]; // counter-rotate the chest
      lft = [Math.sin(p.phase + 0.9) * 0.35, 0, 0]; rft = [-Math.sin(p.phase + 0.9) * 0.35, 0, 0]; // heel strike -> toe off
      bob *= M.bob * (1 + M.limp * Math.max(0, -s));
      if (M.limp) { rl = [rl[0] * (1 - M.limp * 0.5), 0, 0]; spine[2] += Math.max(0, -s) * 0.08 * M.limp; }
    }
    spine[0] += M.hunch; head[0] -= M.hunch * 0.7;
    const sp = p.special ?? 0;
    if (sp > 0 && M.special === 'groundpound') { // wind up (arms high) -> slam (fists down, deep squat)
      const up = Math.min(1, sp / 0.35), dn = Math.max(0, Math.min(1, (sp - 0.35) / 0.12)), rec = Math.max(0, (sp - 0.7) / 0.5);
      const w = (1 - rec);
      la = [(-2.6 * up + 3.3 * dn) * w, 0, 0.3]; ra = la.map((v, i) => (i === 2 ? -0.3 : v)) as number[]; lf = [-1.2 * up * w, 0, 0]; rf = lf.slice();
      lu = [-1.1 * dn * w, 0, 0.25]; ru = [-1.1 * dn * w, 0, -0.25]; ll = [1.5 * dn * w, 0, 0]; rl = ll.slice(); spine = [(-0.3 * up + 0.7 * dn) * w, 0, 0]; bob = -0.35 * dn * w;
    }
    if (sp > 0 && M.special === 'blinkdash') { spine = [0.6, 0, 0]; la = [-1.4, 0, 0.6]; ra = [-1.4, 0, -0.6]; lu = [-0.7, 0, 0]; ru = [0.5, 0, 0]; ll = [0.9, 0, 0]; }
    if (p.damage && p.damage > 0.5) { head[2] += Math.sin(p.t * 1.7) * 0.06 * p.damage; spine[2] += 0.05 * p.damage; }
    hipY += (bob - hipY) * k; if (b.Hips) b.Hips.position.y = (b.Hips.userData.y0 ?? 0) + hipY;
    set('Hips', hips[0], hips[1], hips[2], k); set('Spine', spine[0], spine[1], spine[2] + p.bank * 0.2, k); set('Head', head[0], head[1], head[2], k);
    set('LeftArm', la[0], la[1], la[2], k); set('RightArm', ra[0], ra[1], ra[2], k); set('LeftForeArm', lf[0], lf[1], lf[2], k); set('RightForeArm', rf[0], rf[1], rf[2], k);
    set('LeftUpLeg', lu[0], lu[1], lu[2], k); set('RightUpLeg', ru[0], ru[1], ru[2], k); set('LeftLeg', ll[0], ll[1], ll[2], k); set('RightLeg', rl[0], rl[1], rl[2], k);
    set('LeftFoot', lft[0], lft[1], lft[2], k); set('RightFoot', rft[0], rft[1], rft[2], k);
    const bobM = mocap(p, dt); if (b.Hips) b.Hips.position.y += bobM;
    // ---- per-type run / slide / landing overlays (blend weights come from the controller)
    const fm = p.form ?? 0, sl = p.slide ?? 0, ph2 = Math.sin(p.phase), bl = style === 'heavy' ? fm : 0, hv = style === 'scout' ? fm : 0, gl = style === 'medic' ? fm : 0;
    // foldable bones go back to their rest offset / scale every frame, then the active transformation moves them (staged by the form progress 0..1)
    for (const n of FOLD) { const o = b[n]; if (!o) continue; const p0 = (o.userData.p0 ??= o.position.clone()) as THREE.Vector3; o.position.copy(p0); o.scale.set(1, 1, 1); }
    const fold = (n: string, sc: number, tx: number, ty: number, tz: number, w: number) => { const o = b[n]; if (!o || w <= 0) return; const p0 = o.userData.p0 as THREE.Vector3; o.position.set(p0.x + (tx - p0.x) * w, p0.y + (ty - p0.y) * w, p0.z + (tz - p0.z) * w); o.scale.setScalar(1 + (sc - 1) * w); };
    if (bl > 0) { // Heavy: arms AND legs fold fully into the torso, leaving one giant ball (staged: arms tuck, limbs sink in, legs fold, head retracts, spine curls)
      const sA = sstep(bl, 0, 0.45), sL = sstep(bl, 0.2, 0.75), sS = sstep(bl, 0.4, 0.95), sHd = sstep(bl, 0.2, 0.6), sInA = sstep(bl, 0.4, 0.88), sInL = sstep(bl, 0.5, 0.95);
      ovr('LeftArm', -1.2, 0.5, 0.3, sA); ovr('RightArm', -1.2, -0.5, -0.3, sA); ovr('LeftForeArm', -1.7, 0, 0, sA); ovr('RightForeArm', -1.7, 0, 0, sA);
      ovr('LeftUpLeg', -2.0, 0, 0.1, sL); ovr('RightUpLeg', -2.0, 0, -0.1, sL); ovr('LeftLeg', 2.3, 0, 0, sL); ovr('RightLeg', 2.3, 0, 0, sL); ovr('LeftFoot', -1.6, 0, 0, sL); ovr('RightFoot', -1.6, 0, 0, sL);
      ovr('Spine', 0.75, 0, 0, sS); ovr('Head', 0.5, 0, 0, sHd);
      fold('LeftArm', 0.22, 0.12, 0.3, 0.05, sInA); fold('RightArm', 0.22, -0.12, 0.3, 0.05, sInA); fold('LeftUpLeg', 0.3, 0.07, 0.2, 0.0, sInL); fold('RightUpLeg', 0.3, -0.07, 0.2, 0.0, sInL);
      fold('Head', 0.65, 0, 0.3, 0, sHd); fold('Spine', 1, 0, -0.3, 0.02, sS); if (b.Hips) b.Hips.position.y -= 0.62 * sstep(bl, 0.3, 1); // the dome settles over the pelvis; the ball sits on the ground
    }
    if (hv > 0) { // Scout: low hover-sprint form: legs fold back into the thruster pods, arms tuck, body flattens
      const sA = sstep(hv, 0, 0.4), sL = sstep(hv, 0.15, 0.7), sS = sstep(hv, 0.3, 0.9);
      ovr('LeftArm', 0.45, 0, 0.1, sA); ovr('RightArm', 0.45, 0, -0.1, sA); ovr('LeftForeArm', -0.15, 0, 0, sA); ovr('RightForeArm', -0.15, 0, 0, sA);
      ovr('LeftUpLeg', 1.75, 0, 0.05, sL); ovr('RightUpLeg', 1.75, 0, -0.05, sL); ovr('LeftLeg', 2.45, 0, 0, sL); ovr('RightLeg', 2.45, 0, 0, sL); ovr('LeftFoot', 0.6, 0, 0, sL); ovr('RightFoot', 0.6, 0, 0, sL);
      ovr('Spine', 1.15, 0, 0, sS); ovr('Head', -0.95, 0, 0, sS); ovr('Hips', 0.15, 0, 0, sS);
      fold('LeftUpLeg', 0.72, 0.1, -0.02, 0.02, sL); fold('RightUpLeg', 0.72, -0.1, -0.02, 0.02, sL); fold('LeftArm', 0.88, 0.26, 0.34, -0.04, sA); fold('RightArm', 0.88, -0.26, 0.34, -0.04, sA);
      if (b.Hips) b.Hips.position.y -= 0.5 * sS;
    }
    if (sl > 0) { ovr('Spine', -0.32, 0, 0, sl * (1 - hv * 0.6)); ovr('Head', 0.25, 0, 0, sl); ovr('LeftUpLeg', -1.55, 0, 0.12, sl * (1 - hv)); ovr('LeftLeg', 2.0, 0, 0, sl * (1 - hv)); ovr('RightUpLeg', -0.5, 0, -0.14, sl * (1 - hv)); ovr('RightLeg', 0.25, 0, 0, sl * (1 - hv));
      ovr('LeftFoot', -0.4, 0, 0, sl * (1 - hv)); ovr('RightFoot', 0.2, 0, 0, sl * (1 - hv)); ovr('LeftArm', 0.3, 0, 0.95, sl * (1 - hv)); ovr('RightArm', 0.3, 0, -0.95, sl * (1 - hv)); if (b.Hips) b.Hips.position.y -= 0.34 * sl * (1 - hv); } // Scout: thruster-assisted slide (rides on the hover form)
    if (gl > 0) { // Worker tread mode: legs fold up (thigh forward, shin tucked), hips drop onto the treads (transform.ts), arms hold forward like a forklift, fists closed
      const sL = sstep(gl, 0.1, 0.6), sB = sstep(gl, 0.15, 0.8);
      ovr('LeftUpLeg', -1.9, 0, 0.12, sL); ovr('RightUpLeg', -1.9, 0, -0.12, sL); ovr('LeftLeg', 2.5, 0, 0, sL); ovr('RightLeg', 2.5, 0, 0, sL); ovr('LeftFoot', -0.8, 0, 0, sL); ovr('RightFoot', -0.8, 0, 0, sL);
      ovr('Spine', 0.2, 0, 0, sB); ovr('LeftArm', -0.55, 0, 0.3, sB); ovr('RightArm', -0.55, 0, -0.3, sB); ovr('LeftForeArm', -0.5, 0, 0, sB); ovr('RightForeArm', -0.5, 0, 0, sB);
      fold('LeftUpLeg', 0.85, 0.16, 0.0, 0.0, sL); fold('RightUpLeg', 0.85, -0.16, 0.0, 0.0, sL); if (b.Hips) b.Hips.position.y -= 0.4 * sB;
    }
    if (style === 'medic') { const rat = gl * 0.9 + (p.anim === 'run' ? 0.35 : 0); if (rat > 0.02) for (const n of ['LeftForeArm', 'RightForeArm', 'Spine'] as const) { const o = b[n]; if (o) { o.rotateX(Math.sin(p.t * 53 + n.length) * 0.05 * rat); o.rotateZ(Math.sin(p.t * 67 + n.length * 3) * 0.035 * rat); } } } // tools rattle
    // fingers: relaxed curl in idle/walk, fist on boost / special; thumb curls less
    // medic: open flat hands while the palm jets fire, back to fists (palms to the thighs) on landing
    openC += (open - openC) * (1 - Math.exp(-dt * 10));
    const want = Math.max(open ? 0 : p.fist ?? 0, sp > 0 ? 1 : 0, p.anim === 'fall' || p.anim === 'roll' ? 0.8 : 0, (style === 'medic' && (p.anim === 'land' || (p.form ?? 0) > 0.4)) ? 1 : 0);
    fistC += (want - fistC) * (1 - Math.exp(-dt * 14));
    const cu = (M.curl + (1.25 - M.curl) * fistC) * (1 - openC) - openC * 0.08 + (moving ? Math.sin(p.phase * 2) * 0.04 : Math.sin(p.t * 1.3) * 0.03);
    for (const f of fingers) { const th = (f as string).includes('F9_') /* thumb */; set(f, 0, 0, 0, 1); const o = b[f]!; o.rotateZ(((f as string)[0] === 'L' ? -1 : 1) * (th ? 0.55 : 1) * cu); } // palms face the thighs: curl toward the body midline
  };
}
