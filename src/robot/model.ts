import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Colour regions a player can customise later (join screen). Keys are stable: saved looks depend on them. */
export interface RobotLook { shell: string; joints: string; torso: string; shorts: string; backpack: string; visor: string }
export const DEFAULT_LOOK: RobotLook = { shell: '#eceae4', joints: '#3a3d42', torso: '#f07a22', shorts: '#3c3f45', backpack: '#2ec4d6', visor: '#eceae4' };
const REGIONS = ['shell', 'joints', 'torso', 'shorts', 'backpack', 'visor'] as const;
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
export interface PoseInput { anim: RobotAnim; phase: number; speed: number; lean: number; bank: number; crouch: number; t: number }

/** Bones by Mixamo-style names so Jonn's rig and the placeholder share one pose code path. */
const BONES = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'] as const;
type Bones = Partial<Record<(typeof BONES)[number], THREE.Object3D>>;

/** Procedural pose: Euler targets (x pitch, z roll) per bone; damped so state changes blend. */
function makePoser(b: Bones) {
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
    const k = 1 - Math.exp(-dt * (p.anim === 'roll' ? 30 : 12)), s = Math.sin(p.phase), c = Math.cos(p.phase);
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
    hipY += (bob - hipY) * k; if (b.Hips) b.Hips.position.y = (b.Hips.userData.y0 ?? 0) + hipY;
    set('Hips', hips[0], hips[1], hips[2], k); set('Spine', spine[0], spine[1], spine[2] + p.bank * 0.2, k); set('Head', head[0], head[1], head[2], k);
    set('LeftArm', la[0], la[1], la[2], k); set('RightArm', ra[0], ra[1], ra[2], k); set('LeftForeArm', lf[0], lf[1], lf[2], k); set('RightForeArm', rf[0], rf[1], rf[2], k);
    set('LeftUpLeg', lu[0], lu[1], lu[2], k); set('RightUpLeg', ru[0], ru[1], ru[2], k); set('LeftLeg', ll[0], ll[1], ll[2], k); set('RightLeg', rl[0], rl[1], rl[2], k);
    set('LeftFoot', lft[0], lft[1], lft[2], k); set('RightFoot', rft[0], rft[1], rft[2], k);
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
  const part = (pieces: [THREE.BufferGeometry, Region][]) => {
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
    const m = new THREE.Mesh(g, mat); m.castShadow = false; return m;
  };
  const cap = (r: number, len: number, y: number) => new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, y, 0);
  const sph = (r: number, y: number, sy = 1) => new THREE.SphereGeometry(r, 14, 10).scale(1, sy, 1).translate(0, y, 0);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d, 1, 1, 1).translate(x, y, z);

  const root = new THREE.Group(); root.name = 'Robot';
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); o.userData.y0 = y; parent.add(o); return o; };
  const hips = bone('Hips', root, 0, 0.66, 0);
  hips.add(part([[new THREE.CylinderGeometry(0.15, 0.16, 0.17, 12).translate(0, -0.02, 0), 'shorts']]));
  const spine = bone('Spine', hips, 0, 0.06, 0);
  const torso = part([[cap(0.155, 0.17, 0.17).scale(1, 1, 0.78), 'torso'], [new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10).translate(0, 0.37, 0), 'joints'],
    [box(0.24, 0.27, 0.11, 0, 0.2, -0.16), 'backpack'], [box(0.07, 0.05, 0.05, -0.07, 0.04, -0.21), 'joints'], [box(0.07, 0.05, 0.05, 0.07, 0.04, -0.21), 'joints']]);
  spine.add(torso);
  const head = bone('Head', spine, 0, 0.4, 0);
  head.add(part([[sph(0.135, 0.1, 1.08), 'shell'], [new THREE.SphereGeometry(0.1, 12, 8, -0.9, 1.8, 1.1, 0.6).translate(0, 0.1, 0.035), 'visor']]));
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
    ft.add(part([[box(0.12, 0.1, 0.2, 0, -0.03, 0.03), 'shell'], [box(0.125, 0.025, 0.205, 0, -0.08, 0.03), 'joints'], [new THREE.CylinderGeometry(0.035, 0.045, 0.04, 10).translate(0, -0.1, -0.02), 'joints']]));
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
      const cs = REGIONS.map((r) => col.set(look[r]).clone());
      for (const g of geos) { const a = g.attributes.color as THREE.BufferAttribute, reg = g.userData.region as number[]; for (let i = 0; i < reg.length; i++) { const c = cs[reg[i]]; a.setXYZ(i, c.r, c.g, c.b); } a.needsUpdate = true; }
    },
    animate: (s, dt) => pose(s, dt),
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
    return {
      root, nozzles, height: h,
      setLook(l) { Object.assign(look, l); for (const [k, m] of mats) m.color.set(look[k as Region]); },
      animate(s, dt) {
        if (!mixer) return pose!(s, dt);
        const a = clips.get(s.anim) ?? clips.get(s.anim === 'run' ? 'walk' : s.anim === 'fall' ? 'fly' : 'idle');
        if (a && a !== playing) { a.reset().fadeIn(0.2).play(); playing?.fadeOut(0.2); playing = a; }
        mixer.update(dt);
      },
      dispose() { root.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
    };
  } catch (e) { console.warn('[City] robot.glb failed, using placeholder', e); return createProceduralRobot(look); }
}
