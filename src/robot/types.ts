import SKEL from './skeleton.json';

/** Robot body types. Each has its own Blender kit (public/robot/<type>/) and its own 3 options per slot. */
export type RobotType = 'scout' | 'heavy' | 'worker' | 'glitch';
export const SLOT_KEYS = ['helmet', 'arms', 'bionics', 'legs', 'thrusters', 'boots'] as const;
export type Slot = (typeof SLOT_KEYS)[number];
export type SlotBuild = Record<Slot, string>;
export interface Tuning { walk: number; run: number; cruise: number; burst: number; jump: number; turn: number; accel: number }
export interface Bone { name: string; parent: string | null; pos: [number, number, number] }
export interface TypeDef {
  label: string; blurb: string; height: number; sole: number;
  slots: Record<Slot, readonly string[]>; names: Record<string, string>;
  paint: { shell: string; joints: string; torso: string; shorts: string; backpack: string; visor: string; decalColor: string };
  tune: Tuning; tris: number;
}

export const TYPES: Record<RobotType, TypeDef> = {
  scout: {
    label: 'Scout', blurb: 'Fast recon. Screen head, top speed, quick turns.', height: 2.1, sole: -0.12, tris: 30_000,
    slots: { helmet: ['crt', 'visor', 'twin'], arms: ['long', 'blade', 'grapple'], bionics: ['scope', 'antenna', 'drone'], legs: ['digi', 'straight', 'sprint'], thrusters: ['twin', 'ducted', 'fins'], boots: ['blade', 'pads', 'skids'] },
    names: { crt: 'CRT screen', visor: 'Visor screen', twin: 'Twin lens', long: 'Long reach', blade: 'Blade fin', grapple: 'Grapple', scope: 'Scope', antenna: 'Antenna array', drone: 'Drone pod', digi: 'Digitigrade', straight: 'Straight', sprint: 'Sprint', 'thrusters.twin': 'Twin thrusters', ducted: 'Ducted fans', fins: 'Fin pack', pads: 'Pads', skids: 'Skids' },
    paint: { shell: '#2c2e33', joints: '#151619', torso: '#3c3f46', shorts: '#f07a22', backpack: '#f07a22', visor: '#ff7a1a', decalColor: '#ff8a2a' },
    tune: { walk: 1.15, run: 1.2, cruise: 1.15, burst: 1.2, jump: 1.12, turn: 1.3, accel: 1.3 },
  },
  heavy: {
    label: 'Heavy', blurb: 'Siege frame. Slow, tanky, hydraulic pistons.', height: 2.6, sole: -0.16, tris: 30_000,
    slots: { helmet: ['dome', 'slit', 'periscope'], arms: ['piledriver', 'shield', 'gatling'], bionics: ['reactor', 'plate', 'missiles'], legs: ['piston', 'reverse', 'armored'], thrusters: ['booster', 'cans', 'vectored'], boots: ['tank', 'claw', 'stomper'] },
    names: { dome: 'Sensor dome', slit: 'Slit visor', periscope: 'Periscope', piledriver: 'Pile-driver', shield: 'Shield', gatling: 'Gatling', reactor: 'Reactor', plate: 'Armour plate', missiles: 'Missile pod', piston: 'Piston', reverse: 'Reverse knee', armored: 'Armoured', booster: 'Booster', cans: 'Twin cans', vectored: 'Vectored', tank: 'Tank feet', claw: 'Claw feet', stomper: 'Stompers' },
    paint: { shell: '#6c6e71', joints: '#25272b', torso: '#ed7612', shorts: '#ffd23f', backpack: '#2b2e33', visor: '#59ff8a', decalColor: '#ffd23f' },
    tune: { walk: 0.8, run: 0.78, cruise: 0.85, burst: 0.85, jump: 0.85, turn: 0.72, accel: 0.65 },
  },
  worker: {
    label: 'Worker', blurb: 'Utility rig. Balanced, tool arms, lanky gait.', height: 2.4, sole: -0.14, tris: 30_000,
    slots: { helmet: ['boxcam', 'welder', 'lamp'], arms: ['claw', 'drill', 'welder'], bionics: ['tanks', 'battery', 'reel'], legs: ['cans', 'strut', 'ribbed'], thrusters: ['stacks', 'fans', 'rocket'], boots: ['stabilizer', 'wheels', 'clamp'] },
    names: { boxcam: 'Box cam', welder: 'Welder', lamp: 'Lamp head', claw: 'Cargo claw', drill: 'Drill', tanks: 'Gas tanks', battery: 'Battery crate', reel: 'Cable reel', cans: 'Twin cans', strut: 'Strut', ribbed: 'Ribbed', stacks: 'Exhaust stacks', fans: 'Lift fans', rocket: 'Rocket can', stabilizer: 'Stabilisers', wheels: 'Wheels', clamp: 'Clamp feet' },
    paint: { shell: '#616c38', joints: '#2b2e33', torso: '#ffd23f', shorts: '#f0561f', backpack: '#3c3f45', visor: '#3df2ff', decalColor: '#ffd23f' },
    tune: { walk: 1, run: 1, cruise: 1, burst: 1, jump: 1, turn: 1, accel: 1 },
  },
  glitch: {
    label: 'Glitch', blurb: 'Special. Thousands of cubes that scatter and reform.', height: 2.0, sole: -0.09, tris: 60_000,
    slots: { helmet: ['smooth', 'skull', 'halo'], arms: ['block', 'blade', 'orbit'], bionics: ['wings', 'ring', 'spikes'], legs: ['slim', 'block', 'digi'], thrusters: ['jets', 'trail', 'ring'], boots: ['block', 'hover', 'spike'] },
    names: { smooth: 'Smooth face', skull: 'Open skull', halo: 'Crown halo', block: 'Block', blade: 'Blade', orbit: 'Orbit', wings: 'Wings', ring: 'Ring', 'thrusters.ring': 'Ring jets', spikes: 'Spikes', slim: 'Slim', digi: 'Digitigrade', jets: 'Jets', trail: 'Trail', hover: 'Hover', spike: 'Spike' },
    paint: { shell: '#f2f1ec', joints: '#2b2e33', torso: '#f2f1ec', shorts: '#2b2e33', backpack: '#2b2e33', visor: '#b04bff', decalColor: '#b04bff' },
    tune: { walk: 1.05, run: 1.08, cruise: 1.1, burst: 1.25, jump: 1.15, turn: 1.15, accel: 1.15 },
  },
};
export const TYPE_KEYS = Object.keys(TYPES) as RobotType[];
export const isType = (t: unknown): t is RobotType => typeof t === 'string' && t in TYPES;
export const defaultSlots = (t: RobotType): SlotBuild => Object.fromEntries(SLOT_KEYS.map((k) => [k, TYPES[t].slots[k][0]])) as SlotBuild;
export function sanitizeSlots(raw: unknown, t: RobotType): SlotBuild {
  const out = defaultSlots(t), r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const k of SLOT_KEYS) if (TYPES[t].slots[k].includes(r[k] as string)) out[k] = r[k] as string;
  return out;
}

/** Bone list (parent before child) from src/robot/skeleton.json; Right* mirror Left* in x. */
export function skeleton(t: RobotType): Bone[] {
  const b = (SKEL as any)[t].bones as Record<string, [number, number, number]>;
  const parent: Record<string, string | null> = { Hips: null, Spine: 'Hips', Head: 'Spine', LeftArm: 'Spine', LeftForeArm: 'LeftArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg' };
  const out: Bone[] = [];
  for (const n of Object.keys(parent)) {
    out.push({ name: n, parent: parent[n], pos: b[n] });
    if (n.startsWith('Left')) out.push({ name: n.replace('Left', 'Right'), parent: parent[n]?.replace('Left', 'Right') ?? null, pos: [-b[n][0], b[n][1], b[n][2]] });
  }
  return out;
}
