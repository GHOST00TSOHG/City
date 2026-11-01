import * as THREE from 'three/webgpu';
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
  launch?: number; flyT?: number; thrust?: number }
/** Per-type body mechanics (types.ts TYPES[t].motion). mass slows blends and deepens the plant; sway = hip roll; limp = right-leg hitch. */
export interface MotionProfile { mass: number; bob: number; sway: number; stride: number; arms: number; limp: number; hunch: number; curl: number; special: 'none' | 'groundpound' | 'blinkdash' }
export const DEFAULT_MOTION: MotionProfile = { mass: 1, bob: 1, sway: 1, stride: 1, arms: 1, limp: 0, hunch: 0, curl: 0.35, special: 'none' };

/** Bones by Mixamo-style names so Jonn's rig and the placeholder share one pose code path. */
export const BONES = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'] as const;
export type Bones = Partial<Record<(typeof BONES)[number], THREE.Object3D>> & Record<string, THREE.Object3D | undefined>;

/** Procedural pose: Euler targets (x pitch, z roll) per bone; damped so state changes blend. */
export type FlightStyle = 'scout' | 'heavy' | 'medic' | 'cubes' | 'generic';
export function makePoser(b: Bones, M: MotionProfile = DEFAULT_MOTION, style: FlightStyle = 'generic') {
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
    // fingers: relaxed curl in idle/walk, fist on boost / special; thumb curls less
    // medic: open flat hands while the palm jets fire, back to fists (palms to the thighs) on landing
    openC += (open - openC) * (1 - Math.exp(-dt * 10));
    const want = Math.max(open ? 0 : p.fist ?? 0, sp > 0 ? 1 : 0, p.anim === 'fall' || p.anim === 'roll' ? 0.8 : 0, style === 'medic' && p.anim === 'land' ? 1 : 0);
    fistC += (want - fistC) * (1 - Math.exp(-dt * 14));
    const cu = (M.curl + (1.25 - M.curl) * fistC) * (1 - openC) - openC * 0.08 + (moving ? Math.sin(p.phase * 2) * 0.04 : Math.sin(p.t * 1.3) * 0.03);
    for (const f of fingers) { const th = (f as string).includes('F9_') /* thumb */; set(f, 0, 0, 0, 1); const o = b[f]!; o.rotateZ(((f as string)[0] === 'L' ? -1 : 1) * (th ? 0.55 : 1) * cu); } // palms face the thighs: curl toward the body midline
  };
}
