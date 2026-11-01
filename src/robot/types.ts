import SKEL from './skeleton.json';

/** Robot body types. Each has its own Blender kit (public/robot/<type>/) and its own 3 options per slot. */
import type { MotionProfile } from './model';
export type RobotType = 'scout' | 'heavy' | 'worker' | 'glitch';
export const SLOT_KEYS = ['helmet', 'arms', 'bionics', 'legs', 'thrusters', 'boots'] as const;
export type Slot = (typeof SLOT_KEYS)[number];
export type SlotBuild = Record<Slot, string>;
export interface Tuning { walk: number; run: number; cruise: number; burst: number; jump: number; turn: number; accel: number }
export interface Bone { name: string; parent: string | null; pos: [number, number, number] }
export interface TypeDef {
  label: string; blurb: string; height: number; sole: number; soleZ?: number;
  slots: Record<Slot, readonly string[]>; names: Record<string, string>;
  paint: { shell: string; joints: string; torso: string; shorts: string; backpack: string; visor: string; decalColor: string };
  tune: Tuning; tris: number;
  /** garage colour labels for this type (defaults: Armour, Trim, ...) */
  colourLabels?: Partial<Record<keyof TypeDef['paint'], string>>;
  /** per-type gait / mass layer for makePoser, plus the Q special (duration in s) */
  motion: MotionProfile; specialDur: number;
  /** per-type flight: thruster look, takeoff wind-up, hover bob (thrust.ts, controller.ts, makePoser) */
  flight: FlightProfile;
}
/**
 * style picks the takeoff / hover / cruise / landing poses. Flames: core (white-hot) -> mid -> edge colours, len/width
 * scale the jets, pulse = quick throttle bursts, dust = ground kick-up. launch = crouch wind-up (s) before lift-off.
 * flame 0 (Glitch) = no fire: the body streams cubes instead.
 */
export interface FlightProfile {
  style: 'scout' | 'heavy' | 'medic' | 'cubes'; flame: number; width: number; core: string; mid: string; edge: string;
  pulse: number; dust: number; launch: number; bob: number; smoke: number;
}

export const TYPES: Record<RobotType, TypeDef> = {
  scout: {
    label: 'Scout', blurb: 'Fast recon. Screen head, top speed, quick turns.', height: 2.1, sole: -0.12, tris: 30_000,
    motion: { mass: 0.8, bob: 0.9, sway: 0.7, stride: 1.1, arms: 1.1, limp: 0, hunch: 0.04, curl: 0.35, special: 'none' }, specialDur: 0.8,
    flight: { style: 'scout', flame: 0.9, width: 0.85, core: '#fff6e0', mid: '#ffb347', edge: '#ff5a14', pulse: 1, dust: 0.7, launch: 0.12, bob: 0.03, smoke: 0.6 },
    slots: { helmet: ['crt', 'visor', 'twin'], arms: ['long', 'blade', 'grapple'], bionics: ['scope', 'antenna', 'drone'], legs: ['digi', 'straight', 'sprint'], thrusters: ['twin', 'ducted', 'fins'], boots: ['blade', 'pads', 'skids'] },
    names: { crt: 'CRT screen', visor: 'Visor screen', twin: 'Twin lens', long: 'Long reach', blade: 'Blade fin', grapple: 'Grapple', scope: 'Scope', antenna: 'Antenna array', drone: 'Drone pod', digi: 'Digitigrade', straight: 'Straight', sprint: 'Sprint', 'thrusters.twin': 'Twin thrusters', ducted: 'Ducted fans', fins: 'Fin pack', pads: 'Pads', skids: 'Skids' },
    paint: { shell: '#e9ebee', joints: '#1c1e22', torso: '#1f4fb8', shorts: '#c0181c', backpack: '#f2b01a', visor: '#3df2ff', decalColor: '#f2b01a' },
    tune: { walk: 1.15, run: 1.2, cruise: 1.15, burst: 1.2, jump: 1.12, turn: 1.3, accel: 1.3 },
  },
  heavy: {
    label: 'Heavy', blurb: 'Siege frame. Slow, tanky, hydraulic pistons. Ground-pound (Q).', height: 2.6, sole: -0.32, soleZ: 0.08, tris: 30_000,
    motion: { mass: 2.2, bob: 1.6, sway: 1.5, stride: 0.8, arms: 0.7, limp: 0, hunch: 0.12, curl: 0.45, special: 'groundpound' }, specialDur: 1.2,
    flight: { style: 'heavy', flame: 1.75, width: 1.9, core: '#fffaf0', mid: '#ffa030', edge: '#ff420a', pulse: 0, dust: 2.4, launch: 0.5, bob: 0.1, smoke: 1.4 },
    slots: { helmet: ['dome', 'slit', 'periscope'], arms: ['piledriver', 'shield', 'gatling'], bionics: ['reactor', 'plate', 'missiles'], legs: ['piston', 'reverse', 'armored'], thrusters: ['booster', 'cans', 'vectored'], boots: ['tank', 'claw', 'stomper'] },
    names: { dome: 'Sensor dome', slit: 'Slit visor', periscope: 'Periscope', piledriver: 'Pile-driver', shield: 'Shield', gatling: 'Gatling', reactor: 'Reactor', plate: 'Armour plate', missiles: 'Missile pod', piston: 'Piston', reverse: 'Reverse knee', armored: 'Armoured', booster: 'Booster', cans: 'Twin cans', vectored: 'Vectored', tank: 'Tank feet', claw: 'Claw feet', stomper: 'Stompers' },
    paint: { shell: '#6c6e71', joints: '#25272b', torso: '#ed7612', shorts: '#ffd23f', backpack: '#2b2e33', visor: '#ff2a10', decalColor: '#ffd23f' },
    tune: { walk: 0.8, run: 0.78, cruise: 0.85, burst: 0.85, jump: 0.85, turn: 0.72, accel: 0.65 },
  },
  worker: {
    label: 'Worker', blurb: 'Combat medic. Regen core, injector arm, heal emitter.', height: 2.4, sole: -0.14, tris: 26_000,
    motion: { mass: 1.3, bob: 1.1, sway: 1.1, stride: 0.95, arms: 0.9, limp: 0.35, hunch: 0.08, curl: 0.4, special: 'none' }, specialDur: 0.8,
    flight: { style: 'medic', flame: 1.15, width: 1.1, core: '#eefff2', mid: '#8dff9e', edge: '#ff8a2a', pulse: 0.2, dust: 1, launch: 0.2, bob: 0.025, smoke: 0.5 },
    slots: { helmet: ['boxcam', 'welder', 'lamp'], arms: ['claw', 'drill', 'welder'], bionics: ['tanks', 'battery', 'reel'], legs: ['cans', 'strut', 'ribbed'], thrusters: ['stacks', 'fans', 'rocket'], boots: ['stabilizer', 'wheels', 'clamp'] },
    names: { boxcam: 'Box cam', welder: 'Welder', lamp: 'Lamp head', claw: 'Cargo claw', drill: 'Drill', tanks: 'Gas tanks', battery: 'Battery crate', reel: 'Cable reel', cans: 'Twin cans', strut: 'Strut', ribbed: 'Ribbed', stacks: 'Exhaust stacks', fans: 'Lift fans', rocket: 'Rocket can', stabilizer: 'Stabilisers', wheels: 'Wheels', clamp: 'Clamp feet' },
    paint: { shell: '#616c38', joints: '#2b2e33', torso: '#4a5530', shorts: '#2f8a3e', backpack: '#3c3f45', visor: '#ff3020', decalColor: '#3dff6e' },
    tune: { walk: 1, run: 1, cruise: 1, burst: 1, jump: 1, turn: 1, accel: 1 },
  },
  glitch: {
    label: 'Glitch', blurb: 'Special. A calm human face in a voxel skin that drifts away as a cube cloud. Blink-dash (Q).', height: 2.0, sole: -0.1, tris: 30_000,
    motion: { mass: 0.6, bob: 0.6, sway: 0.5, stride: 1.15, arms: 1.2, limp: 0, hunch: 0.1, curl: 0.5, special: 'blinkdash' }, specialDur: 0.6,
    flight: { style: 'cubes', flame: 0, width: 0, core: '#ffffff', mid: '#ffffff', edge: '#ffffff', pulse: 0, dust: 0, launch: 0.1, bob: 0.035, smoke: 0 },
    slots: { helmet: ['bare', 'crest', 'halo'], arms: ['cables', 'pistons', 'plated'], bionics: ['spine', 'vents', 'ring'], legs: ['bare', 'plated', 'pistons'], thrusters: ['none', 'jets', 'ring'], boots: ['flat', 'plated', 'hover'] },
    names: { 'helmet.bare': 'Bare head', crest: 'Cube crest', halo: 'Cube halo', cables: 'Cables', 'arms.pistons': 'Pistons', 'arms.plated': 'Plated', spine: 'Spine', vents: 'Vents', ring: 'Ring', 'thrusters.ring': 'Ring jets', 'legs.bare': 'Bare', 'legs.plated': 'Plated', 'legs.pistons': 'Pistons', none: 'None', jets: 'Jets', flat: 'Flat', 'boots.plated': 'Plated', hover: 'Hover' },
    paint: { shell: '#e8e7e4', joints: '#1a1b20', torso: '#cfc8c0', shorts: '#b4b6bb', backpack: '#2a2c33', visor: '#b38cff', decalColor: '#f4f2f6' },
    colourLabels: { shell: 'Skin', shorts: 'Skin shade', torso: 'Face', joints: 'Machinery', backpack: 'Cables', visor: 'Glow', decalColor: 'Particles' },
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
  const parent: Record<string, string | null> = (SKEL as any)[t].parents ?? { Hips: null, Spine: 'Hips', Head: 'Spine', LeftArm: 'Spine', LeftForeArm: 'LeftArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg' };
  const out: Bone[] = [];
  for (const n of Object.keys(parent)) {
    out.push({ name: n, parent: parent[n], pos: b[n] });
    if (n.startsWith('Left')) out.push({ name: n.replace('Left', 'Right'), parent: parent[n]?.replace('Left', 'Right') ?? null, pos: [-b[n][0], b[n][1], b[n][2]] });
  }
  return out;
}
