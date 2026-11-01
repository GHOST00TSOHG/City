import { sanitizeLook, REGIONS, type RobotLook } from './robot/model';
import { TYPES, TYPE_KEYS, isType, sanitizeSlots, SLOT_KEYS, type RobotType, type SlotBuild } from './robot/types';

/**
 * Versioned local save. Shape is server-ready: when accounts / multiplayer land, the same JSON is PUT to a profile
 * endpoint (`robot` becomes the player's loadout) and localStorage becomes a cache. Bump `v` and add a migration step
 * below for any breaking change; never reuse a key with a different meaning.
 *
 * v2: robot.type + paint and slots kept per type (switching back restores that type's build and colours); damage is shared.
 * v1 → v2: type 'scout'; v1 paint carried to scout, scout default slots (v1 part names belong to the retired parts set), damage kept.
 * v1 stays in storage untouched for one release.
 */
export type Paint = Pick<RobotLook, (typeof REGIONS)[number]>;
export interface SaveV2 {
  v: 2;
  updatedAt: string; // ISO
  robot: { type: RobotType; paint: Record<RobotType, Paint>; slots: Record<RobotType, SlotBuild>; damage: number };
}
const KEY = 'city.save.v2', V1 = 'city.save.v1', LEGACY_LOOK = 'city.robotLook';
const read = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };

export function migrate(v1: any): any {
  return { v: 2, updatedAt: new Date().toISOString(), robot: { type: 'scout', paint: { scout: v1?.robot?.look ?? {} }, slots: {}, damage: v1?.robot?.damage ?? 0 } };
}
export function loadSave(): SaveV2 {
  let raw = read(KEY);
  if (!raw || raw.v !== 2) {
    let v1 = read(V1);
    if (!v1 || v1.v !== 1) v1 = { v: 1, robot: { look: read(LEGACY_LOOK) ?? {}, damage: 0 } }; // phase-7 look
    const s = normalise(migrate(v1)); writeSave(s); localStorage.removeItem(LEGACY_LOOK); return s;
  }
  return normalise(raw);
}
export function normalise(raw: any): SaveV2 {
  const d = Number(raw?.robot?.damage), type: RobotType = isType(raw?.robot?.type) ? raw.robot.type : 'scout';
  const paint = Object.fromEntries(TYPE_KEYS.map((t) => { const l = sanitizeLook({ ...TYPES[t].paint, ...raw?.robot?.paint?.[t] }, t); return [t, Object.fromEntries(REGIONS.map((k) => [k, l[k]]))]; })) as Record<RobotType, Paint>;
  const slots = Object.fromEntries(TYPE_KEYS.map((t) => [t, sanitizeSlots(raw?.robot?.slots?.[t], t)])) as Record<RobotType, SlotBuild>;
  return { v: 2, updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(), robot: { type, paint, slots, damage: Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0 } };
}
/** The live look for the current type: that type's paint + slots. */
export const lookOf = (s: SaveV2): RobotLook => ({ ...s.robot.paint[s.robot.type], ...s.robot.slots[s.robot.type] });
/** Store a look back into the current type's paint + slots. */
export function storeLook(s: SaveV2, l: RobotLook) {
  for (const k of REGIONS) s.robot.paint[s.robot.type][k] = l[k];
  s.robot.slots[s.robot.type] = Object.fromEntries(SLOT_KEYS.map((k) => [k, l[k]])) as SlotBuild;
}
export function writeSave(s: SaveV2) { s.updatedAt = new Date().toISOString(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full / private mode */ } }
