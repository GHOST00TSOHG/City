import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { attachParts, applyParts, type PartLib } from './parts';
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
  /** Attach the Blender mecha parts (null = bare frame). */
  equip(lib: PartLib | null): void;
  /** k = 0..1 blend weights / phase are computed by the controller; model just poses itself. */
  animate(s: PoseInput, dt: number): void;
  dispose(): void;
}
export interface PoseInput { anim: RobotAnim; phase: number; speed: number; lean: number; bank: number; crouch: number; t: number; fist?: number; special?: number; damage?: number }
/** Per-type body mechanics (types.ts TYPES[t].motion). mass slows blends and deepens the plant; sway = hip roll; limp = right-leg hitch. */
export interface MotionProfile { mass: number; bob: number; sway: number; stride: number; arms: number; limp: number; hunch: number; curl: number; special: 'none' | 'groundpound' | 'blinkdash' }
export const DEFAULT_MOTION: MotionProfile = { mass: 1, bob: 1, sway: 1, stride: 1, arms: 1, limp: 0, hunch: 0, curl: 0.35, special: 'none' };

/** Bones by Mixamo-style names so Jonn's rig and the placeholder share one pose code path. */
export const BONES = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'] as const;
export type Bones = Partial<Record<(typeof BONES)[number], THREE.Object3D>> & Record<string, THREE.Object3D | undefined>;

/** Procedural pose: Euler targets (x pitch, z roll) per bone; damped so state changes blend. */
export function makePoser(b: Bones, M: MotionProfile = DEFAULT_MOTION) {
  const fingers = Object.keys(b).filter((n) => /^(Left|Right)F\d_\d$/.test(n)) as (keyof Bones)[];
  let fistC = 0;
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
    const want = Math.max(p.fist ?? 0, sp > 0 ? 1 : 0, p.anim === 'fall' || p.anim === 'roll' ? 0.8 : 0);
    fistC += (want - fistC) * (1 - Math.exp(-dt * 14));
    const cu = M.curl + (1.25 - M.curl) * fistC + (moving ? Math.sin(p.phase * 2) * 0.04 : Math.sin(p.t * 1.3) * 0.03);
    for (const f of fingers) { const th = (f as string).includes('F9_') /* thumb */; set(f, 0, 0, 0, 1); const o = b[f]!; o.rotateZ(((f as string)[0] === 'L' ? -1 : 1) * (th ? 0.55 : 1) * cu); } // palms face the thighs: curl toward the body midline
  };
}

/**
 * Placeholder robot from the reference video: kid-proportioned matte dummy, white dome head, white limbs,
 * dark grey knee/elbow joints, orange torso, grey shorts, white boots, cyan backpack. ~1.35 m, ~3k tris, 13 draws.
 * One shared vertex-colour material; each vertex carries a region id so setLook() recolours without new shaders.
 */
export function createProceduralRobot(look: RobotLook = DEFAULT_LOOK): RobotModel {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
  const geos: THREE.BufferGeometry[] = [];
  const variants: THREE.Mesh[] = []; let equipped = false, parts: PartLib | null = null;
  const part = (pieces: [THREE.BufferGeometry, Region][], v?: string) => {
    const pos: number[] = [], nrm: number[] = [], reg: number[] = [], idx: number[] = [];
    for (const [g0, r] of pieces) {
      const g = g0.index ? g0 : g0; const off = pos.length / 3;
      pos.push(...(g.attributes.position.array as Float32Array)); nrm.push(...(g.attributes.normal.array as Float32Array));
      for (let i = 0; i < g.attributes.position.count; i++) reg.push(REGIONS.indexOf(r));
      if (g.index) for (const i of Array.from(g.index.array as ArrayLike<number>)) idx.push(i + off); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + off);
      g0.dispose();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3)); g.userData.region = reg; g.setIndex(idx); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.castShadow = false; if (v) { m.userData.v = v; variants.push(m); } return m;
  };
  const cap = (r: number, len: number, y: number) => new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, y, 0);
  const sph = (r: number, y: number, sy = 1) => new THREE.SphereGeometry(r, 14, 10).scale(1, sy, 1).translate(0, y, 0);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d, 1, 1, 1).translate(x, y, z);

  const root = new THREE.Group(); root.name = 'Robot';
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); o.userData.y0 = y; parent.add(o); return o; };
  const hips = bone('Hips', root, 0, 0.66, 0);
  hips.add(part([[new THREE.CylinderGeometry(0.15, 0.16, 0.17, 12).translate(0, -0.02, 0), 'shorts']]));
  const spine = bone('Spine', hips, 0, 0.06, 0);
  spine.add(part([[cap(0.155, 0.17, 0.17).scale(1, 1, 0.78), 'torso'], [new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10).translate(0, 0.37, 0), 'joints']]));
  // Backpacks (all carry the two thruster ports the reference shows)
  const ports = (): [THREE.BufferGeometry, Region][] => [[box(0.07, 0.05, 0.05, -0.07, 0.04, -0.21), 'joints'], [box(0.07, 0.05, 0.05, 0.07, 0.04, -0.21), 'joints']];
  spine.add(part([[box(0.24, 0.27, 0.11, 0, 0.2, -0.16), 'backpack'], ...ports()], 'pack:pack'));
  const tank = (x: number) => new THREE.CapsuleGeometry(0.06, 0.2, 4, 10).translate(x, 0.2, -0.17);
  spine.add(part([[tank(-0.07), 'backpack'], [tank(0.07), 'backpack'], [box(0.2, 0.04, 0.06, 0, 0.2, -0.13), 'joints'], ...ports()], 'pack:tanks'));
  const fin = (x: number) => box(0.2, 0.03, 0.12, x, 0.26, -0.2).rotateZ(x > 0 ? -0.35 : 0.35);
  spine.add(part([[box(0.2, 0.24, 0.09, 0, 0.2, -0.15), 'backpack'], [fin(-0.17), 'backpack'], [fin(0.17), 'backpack'], ...ports()], 'pack:wings'));
  spine.add(part([...ports()], 'pack:none'));
  // Chest decals: thin extrusions sitting just proud of the torso front (z ≈ 0.122)
  const flat = (pts: [number, number][], y = 0.22) => { const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))); return new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }).translate(0, y, 0.116); };
  const star: [number, number][] = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.022 : 0.055; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  spine.add(part([[box(0.2, 0.035, 0.03, 0, 0.2, 0.108), 'decalColor']], 'decal:stripe'));
  spine.add(part([[flat([[-0.08, 0.03], [0, -0.03], [0.08, 0.03], [0.08, 0.0], [0, -0.06], [-0.08, 0.0]]), 'decalColor']], 'decal:chevron'));
  spine.add(part([[flat([[0.015, 0.065], [-0.04, -0.005], [-0.002, -0.005], [-0.02, -0.065], [0.045, 0.012], [0.006, 0.012]]), 'decalColor']], 'decal:bolt'));
  spine.add(part([[flat(star), 'decalColor']], 'decal:star'));
  const head = bone('Head', spine, 0, 0.4, 0);
  head.add(part([[sph(0.135, 0.1, 1.08), 'shell'], [new THREE.SphereGeometry(0.1, 12, 8, -0.9, 1.8, 1.1, 0.6).translate(0, 0.1, 0.035), 'visor']], 'head:dome'));
  head.add(part([[sph(0.13, 0.1, 1.0), 'shell'], [new THREE.CylinderGeometry(0.133, 0.133, 0.05, 16, 1, true, -1.2, 2.4).translate(0, 0.11, 0), 'visor'],
    [new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6).translate(0.07, 0.27, -0.03), 'joints'], [sph(0.016, 0.33).translate(0.07, 0, -0.03), 'visor']], 'head:visor'));
  head.add(part([[new THREE.BoxGeometry(0.24, 0.22, 0.22, 2, 2, 2).translate(0, 0.1, 0), 'shell'], [box(0.18, 0.06, 0.02, 0, 0.12, 0.11), 'visor'], [box(0.03, 0.08, 0.08, -0.13, 0.1, 0), 'joints'], [box(0.03, 0.08, 0.08, 0.13, 0.1, 0), 'joints']], 'head:cube'));
  head.add(part([[sph(0.135, 0.1, 1.08), 'shell'], [new THREE.SphereGeometry(0.1, 12, 8, -0.9, 1.8, 1.1, 0.6).translate(0, 0.1, 0.035), 'visor'], [box(0.03, 0.06, 0.24, 0, 0.245, -0.02), 'torso']], 'head:crest'));
  const arm = (side: 1 | -1) => {
    const L = side > 0 ? 'Left' : 'Right';
    const sh = bone(L + 'Arm', spine, side * 0.2, 0.31, 0); sh.rotation.z = 0;
    sh.add(part([[sph(0.065, 0), 'torso'], [cap(0.045, 0.14, -0.11), 'shell']]));
    const el = bone(L + 'ForeArm', sh, 0, -0.22, 0);
    el.add(part([[sph(0.05, 0), 'joints'], [cap(0.042, 0.13, -0.11), 'shell'], [sph(0.05, -0.235, 1.1), 'shell']]));
  };
  arm(1); arm(-1);
  const nozzles: THREE.Object3D[] = [];
  const leg = (side: 1 | -1) => {
    const L = side > 0 ? 'Left' : 'Right';
    const hp = bone(L + 'UpLeg', hips, side * 0.085, -0.06, 0);
    hp.add(part([[cap(0.062, 0.16, -0.13), 'shell'], [new THREE.CylinderGeometry(0.075, 0.07, 0.1, 10).translate(0, -0.03, 0), 'shorts']]));
    const kn = bone(L + 'Leg', hp, 0, -0.27, 0);
    kn.add(part([[sph(0.06, 0), 'joints'], [cap(0.055, 0.15, -0.13), 'shell']]));
    const ft = bone(L + 'Foot', kn, 0, -0.27, 0);
    const noz = (): [THREE.BufferGeometry, Region] => [new THREE.CylinderGeometry(0.035, 0.045, 0.04, 10).translate(0, -0.1, -0.02), 'joints'];
    ft.add(part([[box(0.12, 0.1, 0.2, 0, -0.03, 0.03), 'shell'], [box(0.125, 0.025, 0.205, 0, -0.08, 0.03), 'joints'], noz()], 'boots:standard'));
    ft.add(part([[box(0.12, 0.1, 0.2, 0, -0.03, 0.03), 'shell'], [new THREE.CylinderGeometry(0.068, 0.064, 0.14, 12).translate(0, 0.06, 0), 'shell'], [box(0.125, 0.025, 0.205, 0, -0.08, 0.03), 'joints'], [new THREE.TorusGeometry(0.066, 0.008, 6, 14).rotateX(Math.PI / 2).translate(0, 0.12, 0), 'torso'], noz()], 'boots:high'));
    ft.add(part([[box(0.15, 0.12, 0.24, 0, -0.025, 0.035), 'shell'], [box(0.155, 0.03, 0.245, 0, -0.08, 0.035), 'joints'], [box(0.155, 0.02, 0.06, 0, 0.0, 0.13), 'torso'], noz()], 'boots:heavy'));
    const nz = new THREE.Object3D(); nz.name = L + 'FootNozzle'; nz.position.set(0, -0.12, -0.02); ft.add(nz); nozzles.push(nz);
  };
  leg(1); leg(-1);
  const bones: Bones = {}; root.traverse((o) => { if ((BONES as readonly string[]).includes(o.name)) (bones as any)[o.name] = o; });
  const pose = makePoser(bones);
  const col = new THREE.Color();
  const model: RobotModel = {
    root, nozzles, height: 1.35,
    setLook(l) {
      Object.assign(look, l);
      const base: Record<string, string> = { head: 'dome', boots: 'standard', pack: 'pack', decal: 'none' };
      for (const m of variants) { const [slot, v] = (m.userData.v as string).split(':'); m.visible = !equipped && base[slot] === v; }
      applyParts(parts, look);
      const cs = REGIONS.map((r) => col.set(look[r]).clone());
      for (const g of geos) { const a = g.attributes.color as THREE.BufferAttribute, reg = g.userData.region as number[]; for (let i = 0; i < reg.length; i++) { const c = cs[reg[i]]; a.setXYZ(i, c.r, c.g, c.b); } a.needsUpdate = true; }
    },
    animate: (s, dt) => pose(s, dt),
    equip(lib) { parts = lib; equipped = !!lib; if (lib) attachParts(root, lib); model.setLook({}); },
    dispose() { geos.forEach((g) => g.dispose()); mat.dispose(); },
  };
  look = { ...look }; model.setLook({});
  return model;
}

/**
 * Jonn's Blender robot drops in at public/robot/robot.glb (Mixamo bone names, nodes LeftFootNozzle / RightFootNozzle,
 * clips named after RobotAnim). Missing file → the procedural placeholder. Tint: materials named after a RobotLook key get recoloured.
 */
export async function loadRobot(look: RobotLook, url = `${import.meta.env.BASE_URL}robot/robot.glb`): Promise<RobotModel> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok || !(head.headers.get('content-type') ?? '').match(/gltf|octet|binary/)) return createProceduralRobot(look);
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene; root.name = 'Robot';
    const box = new THREE.Box3().setFromObject(root), h = box.max.y - box.min.y || 1.35;
    const bones: Bones = {}, nozzles: THREE.Object3D[] = [], mats = new Map<string, THREE.MeshStandardMaterial>();
    root.traverse((o: any) => {
      const n = (o.name as string).replace(/^mixamorig:?/, '');
      if ((BONES as readonly string[]).includes(n)) (bones as any)[n] = o;
      if (/Nozzle/i.test(o.name)) nozzles.push(o);
      
      if (o.material && (REGIONS as readonly string[]).includes(o.material.name)) mats.set(o.material.name, o.material);
    });
    if (!nozzles.length) for (const n of ['LeftFoot', 'RightFoot'] as const) if (bones[n]) nozzles.push(bones[n]!);
    const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : null;
    const clips = new Map(gltf.animations.map((c) => [c.name.toLowerCase(), mixer!.clipAction(c)]));
    let playing: THREE.AnimationAction | null = null;
    const pose = mixer ? null : makePoser(bones);
    let gparts: PartLib | null = null;
    const model: RobotModel = {
      root, nozzles, height: h,
      equip(lib) { gparts = lib; if (lib) attachParts(root, lib); model.setLook({}); },
      setLook(l) {
        Object.assign(look, l); for (const [k, m] of mats) m.color.set(look[k as Region]); applyParts(gparts, look);
      },
      animate(s, dt) {
        if (!mixer) return pose!(s, dt);
        const a = clips.get(s.anim) ?? clips.get(s.anim === 'run' ? 'walk' : s.anim === 'fall' ? 'fly' : 'idle');
        if (a && a !== playing) { a.reset().fadeIn(0.2).play(); playing?.fadeOut(0.2); playing = a; }
        mixer.update(dt);
      },
      dispose() { root.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
    };
    model.setLook({}); return model;
  } catch (e) { console.warn('[City] robot.glb failed, using placeholder', e); return createProceduralRobot(look); }
}
