/**
 * THE world registry: the one place that knows which areas exist and where they are.
 *
 * - id, label, public ENU origin (lat/lon from tools/bake/areas.json: the same point the bake projected from), start views
 * - `bounds`: tile extent in the area's own ENU frame (from the bake bbox; replaced by the real terrain extent once the data is in)
 * - `worldOffset`: where the area's local origin sits in ONE shared world frame (metres, x east, z south like every area frame),
 *   so world = local + worldOffset. The frame is a flat equirectangular plane around WORLD_ORIGIN (the Newark origin), with the same
 *   sphere and formula as the bake projector and the landmark loader, so local placement is unchanged.
 * - load state + tile handles: `data` (fetched, decoded tile data, one shared promise per area) and `tile` (the built scene content).
 *
 * Rendering is still one active area at a time (floating origin = the area's own frame); nothing here moves geometry yet.
 * Coordinates stay local per area for float32 precision; use toWorld / toLocal / areaAt to cross between frames.
 */
import areaDefs from '../../tools/bake/areas.json';
import { fetchArea, type AreaBundle } from '../area/data';

/** Same sphere as tools/bake/lib.mjs and src/area/landmarks.ts. */
export const EARTH_R = 6378137;
const K = (Math.PI / 180) * EARTH_R;
export interface LatLon { lat: number; lon: number }
/** Equirectangular ENU around `origin`: x east, z south (m). One formula for the bake, landmarks and the world frame. */
export function projectLatLon(origin: LatLon, lat: number, lon: number): [number, number] {
  return [(lon - origin.lon) * K * Math.cos((origin.lat * Math.PI) / 180), -(lat - origin.lat) * K];
}

export type LoadState = 'idle' | 'loading' | 'data' | 'built' | 'active' | 'error';
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface AreaView { name: string; pos: [number, number, number]; look: [number, number, number]; snap?: boolean }
/** A built tile: the scene content for one area (meshes in `group`, freed by `dispose`). */
export interface Tile { id: string; group: { visible: boolean }; dispose(): void }
export interface AreaEntry {
  readonly id: string;
  /** switcher button text */ readonly label: string;
  /** HUD title */ readonly title: string;
  readonly origin: LatLon;
  /** tile extent, area-local ENU m */ bounds: Bounds;
  /** true once `bounds` comes from the decoded terrain instead of the bake bbox */ boundsExact: boolean;
  /** area-local origin in the shared world frame, m */ readonly worldOffset: { readonly x: number; readonly z: number };
  readonly views: AreaView[];
  load: LoadState;
  /** fetched + decoded data (shared promise), null until requested */ data: Promise<AreaBundle> | null;
  bundle: AreaBundle | null;
  tile: Tile | null;
}

/** UI strings and public start views per area. Origins: Southernmost Point Buoy (Key West), Twin Lights (Highlands), Sandy Hook Lighthouse,
 *  Newark Schools Stadium, Riverfront Park (Newark). Public places only. */
const META: Record<string, { label: string; title: string; views: AreaView[] }> = {
  keywest: { label: 'Key West', title: 'Key West, FL · Old Town', views: [
    { name: 'aerial', pos: [650, 420, 700], look: [-900, 0, -1300] },
    { name: 'oldtown', pos: [-520, 140, -760], look: [-1050, 0, -1350] },
    { name: 'duval', pos: [-905, 1.7, -1180], look: [-1060, 3, -1520], snap: true }] },
  bayshore: { label: 'Highlands', title: 'Highlands, NJ · Bayshore', views: [
    { name: 'aerial', pos: [500, 260, 300], look: [-700, 0, -1300] },
    { name: 'street', pos: [-700, 1.7, -1450], look: [-1300, 3, -1500], snap: true }] },
  sandyhook: { label: 'Sandy Hook', title: 'Sandy Hook, NJ', views: [
    { name: 'aerial', pos: [900, 420, 1300], look: [-200, 0, -600] },
    { name: 'street', pos: [60, 1.7, 80], look: [60, 3, -400], snap: true }] },
  newark: { label: 'Newark', title: 'Newark, NJ · Schools Stadium', views: [
    { name: 'aerial', pos: [650, 360, 650], look: [0, 0, 0] },
    { name: 'street', pos: [200, 1.7, 120], look: [700, 3, 120], snap: true }] },
  passaic: { label: 'Passaic', title: 'Newark, NJ · Passaic waterfront', views: [
    { name: 'aerial', pos: [-600, 320, 800], look: [150, 0, -150] },
    { name: 'dock', pos: [0, 30, 0], look: [0, 0, 0] }] },
};
/** Switcher order. */
export const AREA_IDS = ['keywest', 'bayshore', 'sandyhook', 'newark', 'passaic'] as const;
export type AreaId = (typeof AREA_IDS)[number];
/** The shared frame's (0, 0): the Newark Schools Stadium origin, in the middle of the NJ areas. */
export const WORLD_ORIGIN_ID: AreaId = 'newark';
const DEFS = areaDefs as unknown as Record<string, { origin: LatLon; bbox: { west: number; south: number; east: number; north: number } }>;
const worldOrigin = DEFS[WORLD_ORIGIN_ID].origin;

function makeEntry(id: AreaId): AreaEntry {
  const d = DEFS[id], m = META[id], [ox, oz] = projectLatLon(worldOrigin, d.origin.lat, d.origin.lon);
  const [x0, zN] = projectLatLon(d.origin, d.bbox.north, d.bbox.west), [x1, zS] = projectLatLon(d.origin, d.bbox.south, d.bbox.east);
  return { id, label: m.label, title: m.title, origin: d.origin, bounds: { minX: x0, maxX: x1, minZ: zN, maxZ: zS }, boundsExact: false,
    worldOffset: { x: ox, z: oz }, views: m.views, load: 'idle', data: null, bundle: null, tile: null };
}
const entries = new Map<string, AreaEntry>(AREA_IDS.map((id) => [id, makeEntry(id)]));

export const registry = {
  /** all areas in switcher order */
  get areas(): AreaEntry[] { return AREA_IDS.map((id) => entries.get(id)!); },
  has(id: string | null | undefined): id is AreaId { return !!id && entries.has(id); },
  get(id: string): AreaEntry { const e = entries.get(id); if (!e) throw new Error(`unknown area ${id}`); return e; },
  /** the area currently built into the scene */
  get activeId(): string | null { for (const e of entries.values()) if (e.load === 'active') return e.id; return null; },
  /** Marks `id` as the live area (its tile is in the scene); any previous live area drops back to 'built' (or 'data' if its tile is gone). */
  setActive(id: string) { for (const e of entries.values()) if (e.load === 'active' && e.id !== id) e.load = e.tile ? 'built' : 'data'; registry.get(id).load = 'active'; },
  /** Fetch + decode an area (once; later calls share the promise and a later switch is instant). */
  loadData(id: string): Promise<AreaBundle> {
    const e = registry.get(id);
    if (!e.data) {
      if (e.load === 'idle' || e.load === 'error') e.load = 'loading';
      e.data = fetchArea(id).then((b) => {
        e.bundle = b; if (e.load === 'loading') e.load = 'data';
        const t = b.terrain; e.bounds = { minX: t.x0, maxX: t.x0 + (t.nx - 1) * t.cell, minZ: t.z0, maxZ: t.z0 + (t.nz - 1) * t.cell }; e.boundsExact = true;
        return b;
      }, (err) => { e.load = 'error'; e.data = null; throw err; });
    }
    return e.data;
  },
  /** Attach / detach the built scene content of an area. */
  setTile(id: string, tile: Tile | null) { const e = registry.get(id); e.tile = tile; if (tile && e.load !== 'active') e.load = 'built'; if (!tile && e.load === 'built') e.load = e.bundle ? 'data' : 'idle'; },
  /** area-local -> shared world frame (writes into `out`, returns it) */
  toWorld(id: string, x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }) { const o = registry.get(id).worldOffset; out.x = x + o.x; out.z = z + o.z; return out; },
  toLocal(id: string, wx: number, wz: number, out: { x: number; z: number } = { x: 0, z: 0 }) { const o = registry.get(id).worldOffset; out.x = wx - o.x; out.z = wz - o.z; return out; },
  /** The area whose tile contains the world point, else the nearest tile (distance to its bounds rectangle). */
  areaAt(wx: number, wz: number): AreaEntry {
    let best = entries.get(AREA_IDS[0])!, bd = Infinity;
    for (const e of entries.values()) {
      const x = wx - e.worldOffset.x, z = wz - e.worldOffset.z, b = e.bounds;
      const d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },
};
