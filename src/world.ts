// One-world layout (docs/WORLD-PLAN.md, 6a). Read-only accessors over tools/world/world.json.
// Not wired into the scene yet: areas still load and switch on their own local frames.
import world from '../tools/world/world.json';

export type AreaId = 'bayshore' | 'sandyhook' | 'passaic' | 'newark' | 'keywest';
export interface WorldArea { cluster: string; offset: [number, number]; flyOnly?: boolean }
export interface Connector { id: string; from: string; to: string; widthM: number; points: [number, number][] }

const areas = world.areas as unknown as Record<string, WorldArea>;

/** World offset (x east, z south, metres) of an area's local origin; [0, 0] for unknown ids. */
export function worldOffset(id: string): [number, number] { return areas[id]?.offset ?? [0, 0]; }
/** Areas reachable by road from `id` (same cluster or joined by a connector). Key West is fly-only. */
export function roadNeighbours(id: string): string[] {
  const c = areas[id]?.cluster; if (!c || areas[id].flyOnly) return [];
  const linked = new Set(Object.keys(areas).filter((k) => k !== id && areas[k].cluster === c));
  for (const k of connectors()) { if (k.from === id) linked.add(k.to); if (k.to === id) linked.add(k.from); }
  return [...linked];
}
export function connectors(): Connector[] { return world.connectors as unknown as Connector[]; }
/** Convert a point in one area's local frame to another area's local frame through the world frame. */
export function rebase(x: number, z: number, from: string, to: string): [number, number] {
  const a = worldOffset(from), b = worldOffset(to); return [x + a[0] - b[0], z + a[1] - b[1]];
}
