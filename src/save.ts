import { sanitizeLook, type RobotLook } from './robot/model';

/**
 * Versioned local save. Shape is server-ready: when accounts / multiplayer land, the same JSON is PUT to a profile
 * endpoint (`robot` becomes the player's loadout) and localStorage becomes a cache. Bump `v` and add a migration step
 * below for any breaking change; never reuse a key with a different meaning.
 */
export interface SaveV1 {
  v: 1;
  updatedAt: string; // ISO
  robot: { look: RobotLook; damage: number };
}
const KEY = 'city.save.v1', LEGACY_LOOK = 'city.robotLook';

export function loadSave(): SaveV1 {
  let raw: any = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* corrupt → fresh */ }
  if (!raw || raw.v !== 1) {
    // migrate phase-7 look (city.robotLook) → save v1; its colour keys carry over, unknown keys drop
    let legacy: unknown = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_LOOK) ?? 'null'); } catch { /* ignore */ }
    raw = { v: 1, updatedAt: new Date().toISOString(), robot: { look: legacy ?? {}, damage: 0 } };
    const s = normalise(raw); writeSave(s); localStorage.removeItem(LEGACY_LOOK); return s;
  }
  return normalise(raw);
}
function normalise(raw: any): SaveV1 {
  const d = Number(raw?.robot?.damage);
  return { v: 1, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(), robot: { look: sanitizeLook(raw?.robot?.look), damage: Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0 } };
}
export function writeSave(s: SaveV1) { s.updatedAt = new Date().toISOString(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full / private mode */ } }
