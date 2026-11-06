/** Layout data for the six towns (fountain waterY = measured basin water level x item scale, tools/measure-basins.mjs) (local metres around the town centre: u east, v south; rot in degrees about Y, 0 = model front toward +v / south).
 *  Every model path here is a pack file under public/tja/ (tools/stage-used-tja.mjs reads this file to build the ship list). */
export interface Item {
  p: string; u: number; v: number; rot?: number; s?: number; sy?: number; y?: number;
  /** ground tile: top surface flush with the paved plaza level (pad.y + 0.03) */ tile?: boolean;
  /** adds a collider box from the model's size */ solid?: boolean;
  box?: { w: number; d: number; y0?: number; y1: number; rgb: [number, number, number]; rough?: number; emissive?: number };
  ring?: { r0: number; r1: number; y0?: number; y1: number; rgb: [number, number, number]; rough?: number; emissive?: number };
}
export interface FountainDef { x: number; z: number; y: number; radius: number; height: number; waterY: number; tone: 'sky' | 'neon' | 'coral' | 'gold'; jets?: number }
export interface TownDef {
  id: string; name: string; area: string; half: [number, number]; minH: number; water?: boolean;
  view?: { stand: [number, number]; look: [number, number, number] };
  slab?: { u: number; v: number; w: number; d: number };
  /** prefer a site whose +v (gate) edge faces a lane-marked street; items() then receives the stone-walk length to the sidewalk */ frontRoad?: boolean;
  items(apron?: number): Item[]; fountains(y: number): FountainDef[];
  /** photoreal textured `realistic-city` models (their own PBR textures, instanced; a few draw calls) */ real?: { p: string; u: number; v: number; rot?: number; s?: number }[];
}

// ---- town exclusion: world rectangles of every custom town per area (registered by planTowns), so no street, lane line, lamp, house box or forest tree is made inside a paved plaza ----
const EXCLUSION = new Map<string, { x0: number; z0: number; x1: number; z1: number }[]>();
export function setTownExclusion(areaId: string, rects: { x0: number; z0: number; x1: number; z1: number }[]) { EXCLUSION.set(areaId, rects); }
/** true when (x, z) lies within `pad` metres of a custom town's paved rectangle in that area */
export function isInTownExclusion(areaId: string, x: number, z: number, pad = 0): boolean {
  const l = EXCLUSION.get(areaId); if (!l) return false;
  for (const r of l) if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
  return false;
}

const rc = (f: string) => `realistic-city/${f}.glb`;
const mk = (pack: string) => (f: string) => `${pack}/${f}.glb`;
const edo = mk('edo-village'), cy = mk('cyberpunk'), pa = mk('city-paris'), ru = mk('ancient-ruins'), af = mk('airfield'), na = mk('nature'), cz = mk('cozy-village'), vb = mk('vice-beach'), fm = mk('farm'), sw = mk('swamp-bayou'), ac = mk('accessibility'), rw = mk('railway'), cs = mk('construction-site'), bk = mk('bunker-facility'), vk = mk('viking-fjord'), ar = mk('arctic-station'), dk = mk('desert-kingdom'), wl = mk('wasteland'), hw = mk('halloween'), hp = mk('haunted-parlour'), dg = mk('dungeon'), au = mk('autumn'), gs = mk('grocery-store'), lb = mk('library'), bs = mk('bookshop'), lr = mk('living-room'), kt = mk('kitchen'), dr = mk('dining-room'), bd = mk('bedroom'), bt = mk('bathroom'), ho = mk('home-office'), ci = mk('city'), mt = mk('metropolis'), sb = mk('suburban-neighborhood');

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** yaw (deg) that points a front-+z model at the target */
const face = (u: number, v: number, tu: number, tv: number) => Math.round((Math.atan2(tu - u, tv - v) * 180) / Math.PI);
const grid = (p: string, u0: number, v0: number, nu: number, nv: number, step: number, o: Partial<Item> = {}): Item[] => { const out: Item[] = []; for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) out.push({ p, u: u0 + i * step, v: v0 + j * step, tile: true, ...o }); return out; };
const row = (p: string, u0: number, v0: number, du: number, dv: number, n: number, o: Partial<Item> = {}): Item[] => Array.from({ length: n }, (_, i) => ({ p, u: u0 + du * i, v: v0 + dv * i, ...o }));
const scatter = (ps: string[], n: number, [u0, v0, u1, v1]: number[], seed: number, s0: number, s1: number, keep: (u: number, v: number) => boolean = () => true): Item[] => {
  const r = rng(seed), out: Item[] = []; let guard = 0;
  while (out.length < n && guard++ < n * 40) { const u = u0 + r() * (u1 - u0), v = v0 + r() * (v1 - v0); if (!keep(u, v)) continue; out.push({ p: ps[Math.floor(r() * ps.length)], u, v, rot: Math.floor(r() * 360), s: s0 + r() * (s1 - s0) }); }
  return out;
};
const outside = (hu: number, hv: number) => (u: number, v: number) => Math.abs(u) > hu || Math.abs(v) > hv;
const STONE: [number, number, number] = [0.52, 0.5, 0.46], DARK: [number, number, number] = [0.2, 0.2, 0.22];
/** A fountain basin rim built from boxes: wall ring of radius r (used where no basin model exists). */
const basin = (r: number, h: number, rgb: [number, number, number] = STONE): Item[] => [{ p: '', u: 0, v: 0, ring: { r0: r - 0.35, r1: r, y1: h, rgb } }, { p: '', u: 0, v: 0, box: { w: r * 2, d: r * 2, y1: 0.08, rgb: DARK, rough: 0.2 } }];

/** A one-room cutaway shop: floor, back + side walls from a room kit, a lit window wall at the front (z+), a hero prop inside. Room is cols x depth pieces of `piece` metres. */
function room(kit: (f: string) => string, wall: string, win: string, floor: string | null, u: number, v: number, o: { cols: number; depth: number; piece: number; s: number; props: [string, number, number, number?, number?][] }): Item[] {
  const { cols, depth, piece, s, props } = o, w = piece * s, out: Item[] = [], x0 = u - (cols * w) / 2 + w / 2, z0 = v - (depth * w) / 2 + w / 2;
  for (let i = 0; i < cols; i++) { out.push({ p: kit(wall), u: x0 + i * w, v: v - (depth * w) / 2 + 0.05, rot: 0, s }); out.push({ p: kit(win), u: x0 + i * w, v: v + (depth * w) / 2 - 0.05, rot: 180, s }); }
  for (let j = 0; j < depth; j++) { out.push({ p: kit(wall), u: u - (cols * w) / 2 + 0.05, v: z0 + j * w, rot: 90, s }); out.push({ p: kit(wall), u: u + (cols * w) / 2 - 0.05, v: z0 + j * w, rot: -90, s }); }
  if (floor) for (let j = 0; j < depth; j++) for (let i = 0; i < cols; i++) out.push({ p: kit(floor), u: x0 + i * w, v: z0 + j * w, s, tile: true });
  for (const [f, pu, pv, rot, sc] of props) out.push({ p: kit(f), u: u + pu, v: v + pv, rot: rot ?? 0, s: sc ?? s });
  out.push({ p: '', u, v, box: { w: cols * w, d: depth * w, y0: 2.6 * s, y1: 2.66 * s, rgb: [0.3, 0.3, 0.32] } }); // roof slab
  return out;
}

// ---- plazas, paths and curbs: boxes / rings stamped into each town's merged mesh (no extra draw calls) ----
// Heights are metres above the town pad: base slab 0.02 (under the pack tiles at 0.03), raised pads 0.07 (solid, so walkers stand on them), curb strips 0.10.
type RGB = [number, number, number];
const PAD_H = 0.07, CURB_H = 0.10;
const B = (u: number, v: number, w: number, d: number, y1: number, rgb: RGB, o: { y0?: number; rough?: number; emissive?: number; solid?: boolean; rot?: number } = {}): Item => ({ p: '', u, v, rot: o.rot, solid: o.solid, box: { w, d, y0: o.y0, y1, rgb, rough: o.rough, emissive: o.emissive } });
type Rect = [number, number, number, number]; // u0 v0 u1 v1
const rectMinus = (r: Rect, holes: Rect[]): Rect[] => holes.reduce<Rect[]>((rs, h) => rs.flatMap((q) => {
  if (h[2] <= q[0] || h[0] >= q[2] || h[3] <= q[1] || h[1] >= q[3]) return [q];
  const o: Rect[] = [], a = Math.max(q[0], h[0]), b = Math.max(q[1], h[1]), c = Math.min(q[2], h[2]), d = Math.min(q[3], h[3]);
  if (q[1] < b) o.push([q[0], q[1], q[2], b]); if (d < q[3]) o.push([q[0], d, q[2], q[3]]); if (q[0] < a) o.push([q[0], b, a, d]); if (c < q[2]) o.push([c, b, q[2], d]);
  return o;
}), [r]);
/** ground slab under a whole footprint (holes keep ponds / streams open) */
const ground = (r: Rect, rgb: RGB, holes: Rect[] = [], o: { rough?: number } = {}): Item[] => rectMinus(r, holes).map(([a, b, c, d]) => B((a + c) / 2, (b + d) / 2, c - a, d - b, 0.02, rgb, { y0: -0.08, rough: o.rough }));
/** raised, curbed walkway or apron centred at u,v (w across u, d across v) */
const pad = (u: number, v: number, w: number, d: number, rgb: RGB, curb: RGB, o: { rough?: number; h?: number } = {}): Item[] => {
  const h = o.h ?? PAD_H, c = 0.3, ch = h + 0.03;
  return [B(u, v, w, d, h, rgb, { y0: -0.02, rough: o.rough, solid: true }), B(u, v - d / 2 + c / 2, w, c, ch, curb, { y0: -0.02 }), B(u, v + d / 2 - c / 2, w, c, ch, curb, { y0: -0.02 }), B(u - w / 2 + c / 2, v, c, d - 2 * c, ch, curb, { y0: -0.02 }), B(u + w / 2 - c / 2, v, c, d - 2 * c, ch, curb, { y0: -0.02 })];
};
/** thin emissive strip (neon seams, grates) lying on the paving */
const strip = (u: number, v: number, w: number, d: number, rgb: RGB, e = 1.3, y = 0.036): Item => B(u, v, w, d, y, rgb, { y0: 0.03, rough: 0.2, emissive: e });

/** dark-granite flagstone slabs laid on a raised pad (top at h): one box per slab with a small colour variation, grout left open between them */
const flags = (r: Rect, sw: number, sd: number, h: number, base: RGB, seed: number, vary = 0.05): Item[] => {
  const rn = rng(seed), out: Item[] = [], nu = Math.max(1, Math.floor((r[2] - r[0]) / sw)), nv = Math.max(1, Math.floor((r[3] - r[1]) / sd)), u0 = r[0] + (r[2] - r[0] - nu * sw) / 2 + sw / 2, v0 = r[1] + (r[3] - r[1] - nv * sd) / 2 + sd / 2;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = (rn() - 0.5) * vary * 2, c: RGB = [base[0] + k, base[1] + k, base[2] + k * 1.15]; out.push(B(u0 + i * sw, v0 + j * sd, sw - 0.1, sd - 0.1, h + 0.012, c, { y0: h - 0.004, rough: 0.8 })); }
  return out;
};
/** subtle tile seams across a ground rect (thin darker lines every `step` m) */
const seams = (r: Rect, step: number, rgb: RGB, y = 0.027): Item[] => {
  const out: Item[] = [];
  for (let u = Math.ceil(r[0] / step) * step; u <= r[2]; u += step) out.push(B(u, (r[1] + r[3]) / 2, 0.07, r[3] - r[1], y, rgb, { y0: 0.02, rough: 0.9 }));
  for (let v = Math.ceil(r[1] / step) * step; v <= r[3]; v += step) out.push(B((r[0] + r[2]) / 2, v, r[2] - r[0], 0.07, y, rgb, { y0: 0.02, rough: 0.9 }));
  return out;
};
/** stone tree pit: low ring round a tree */
const pit = (u: number, v: number, r = 1.2, rgb: RGB = [0.5, 0.47, 0.42]): Item => ({ p: '', u, v, ring: { r0: r * 0.55, r1: r, y0: -0.02, y1: 0.12, rgb } });
const BENCH_RC = rc('realistic_bench_01');
/** a ring of town benches round a focus: seat toward the focus (model seat faces +z, so yaw = face()) */
const benchesAround = (cu: number, cv: number, pts: [number, number][], s = 1.6): NonNullable<TownDef['real']> => pts.map(([u, v]) => ({ p: BENCH_RC, u: cu + u, v: cv + v, s, rot: face(cu + u, cv + v, cu, cv) }));

const edoTown: TownDef = {
  id: 'edo', name: 'Edo', area: 'bayshore', half: [46, 46], minH: 1.0, frontRoad: true,
  view: { stand: [0, 32], look: [0, -22, 4] }, slab: { u: 0, v: 0, w: 24, d: 88 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 2.0, height: 3.2, waterY: 0.7, tone: 'gold', jets: 12 }, { x: -24, z: 8, y: 0, radius: 2.6, height: 1.2, waterY: 0.32, tone: 'sky', jets: 8 }],
  real: [{ p: rc('realistic_rock_boulder_01'), u: -40, v: -20, s: 2 }, { p: rc('realistic_rock_boulder_01'), u: 40, v: 24, s: 1.6 }],
  items(apron = 0) {
    const S = 2.2, I: Item[] = [];
    { // raked-sand courtyard, dark-granite flagstone sando from the gate to the shrine, raised stone borders, timber-dark plinths, moss garden beds
      const SAND: RGB = [0.62, 0.54, 0.4], FLAG: RGB = [0.17, 0.17, 0.19], SLAB: RGB = [0.27, 0.27, 0.29], CURB: RGB = [0.34, 0.33, 0.32], PLINTH: RGB = [0.22, 0.17, 0.13], MOSS: RGB = [0.15, 0.23, 0.11];
      I.push(...ground([-46, -46, 46, 46], SAND, [[-29, -29, -19, 21]]), ...pad(0, 28, 4.4, 36, FLAG, CURB), ...pad(0, -19, 4.4, 22, FLAG, CURB));
      I.push(...flags([-1.9, 10.3, 1.9, 45.7], 1.9, 1.4, PAD_H, SLAB, 11), ...flags([-1.9, -29.7, 1.9, -8.3], 1.9, 1.4, PAD_H, SLAB, 12));
      for (const [u, v, w, d] of [[-7.1, 12.3, 10.4, 0.5], [7.1, 12.3, 10.4, 0.5], [-7.1, -12.3, 10.4, 0.5], [7.1, -12.3, 10.4, 0.5], [-12.3, 0, 0.5, 24.6], [12.3, 0, 0.5, 24.6]] as const) I.push(B(u, v, w, d, CURB_H, CURB, { y0: -0.1 })); // gravel court border
      for (const [u, v, w, d] of [[0, -37, 13, 10], [-20, -34, 12, 9], [-32, -28, 9, 9], [32, -30, 9, 9]]) I.push(B(u, v, w, d, 0.16, PLINTH, { y0: -0.1, rough: 0.8 }), B(u, v, w + 0.6, d + 0.6, 0.1, CURB, { y0: -0.1 }));
      for (const [u, v] of [[-38, 10], [36, 8], [12, -36]] as const) I.push(...pad(u, v, 7, 7, MOSS, CURB, { rough: 0.95 })); // maple garden beds
    }
    if (apron > 0) { const FL: RGB = [0.17, 0.17, 0.19], CB: RGB = [0.34, 0.33, 0.32]; I.push(...pad(0, 46 + apron / 2, 4.4, apron, FL, CB), ...flags([-1.9, 46, 1.9, 46 + apron], 1.9, 1.4, PAD_H, [0.27, 0.27, 0.29], 13)); } // stone entry walk from the road sidewalk to the torii
    I.push(...grid(edo('raked_gravel_tile'), -8, -8, 3, 3, 8, { s: 2 }), ...grid(edo('moss_tile'), 16, -8, 1, 3, 8, { s: 2 }));
    I.push({ p: edo('koi_pond_tile'), u: -24, v: 8, s: 2, tile: true }, { p: edo('koi_pond_tile'), u: -24, v: 16, s: 2, tile: true }, ...row(edo('garden_stream_tile'), -24, -8, 0, -8, 3, { s: 2, tile: true }));
    I.push({ p: edo('arched_bridge'), u: -24, v: -12, s: 2.2, rot: 90 }, { p: edo('chozuya_pavilion'), u: 0, v: 0, s: S });
    I.push({ p: edo('great_torii'), u: 0, v: 40, s: S }, { p: edo('great_torii'), u: 0, v: 28, s: S });
    for (const v of [34, 22, -12, -24]) I.push({ p: edo('stone_lantern'), u: -3.4, v, s: 2 }, { p: edo('stone_lantern'), u: 3.4, v, s: 2 }); // lanterns stand along the path curbs
    for (const v of [40, 16, -18]) I.push({ p: edo('andon_lantern_post'), u: -3.4, v, s: 2 }, { p: edo('andon_lantern_post'), u: 3.4, v, s: 2 });
    I.push({ p: edo('shinto_shrine'), u: 0, v: -37, s: S, solid: true }, { p: edo('komainu_pair'), u: 0, v: -27, s: 2 }, { p: edo('worship_hall'), u: -20, v: -34, s: S, rot: 20, solid: true });
    I.push({ p: edo('multi_tier_pagoda'), u: -32, v: -28, s: 1.7, solid: true }, { p: edo('shoro_bell_tower'), u: 32, v: -30, s: 1.9, solid: true });
    // machiya lining both sides of the walkway, facing inward
    I.push({ p: edo('machiya_townhouse'), u: 27, v: 18, s: S, rot: face(27, 18, 0, 18), solid: true }, { p: edo('merchant_shop'), u: 27, v: 6, s: S, rot: face(27, 6, 0, 6), solid: true }, { p: edo('teahouse'), u: 27, v: -6, s: S, rot: face(27, -6, 0, -6), solid: true });
    I.push({ p: edo('noodle_shop'), u: -29, v: 30, s: S, rot: face(-29, 30, 0, 30), solid: true }, { p: edo('machiya_townhouse'), u: -29, v: 41, s: S, rot: face(-29, 41, 0, 41), solid: true }, { p: edo('merchant_shop'), u: 27, v: 30, s: S, rot: face(27, 30, 0, 30), solid: true }, { p: edo('machiya_townhouse'), u: 27, v: 41, s: S, rot: face(27, 41, 0, 41), solid: true });
    I.push({ p: edo('karesansui_center'), u: 18, v: -22, s: 2 });
    I.push({ p: edo('maple_tree'), u: -38, v: 10, s: 2 }, { p: edo('maple_tree'), u: 36, v: 8, s: 2 }, { p: edo('maple_tree'), u: 12, v: -36, s: 2.2 }, { p: edo('pine_tree'), u: -40, v: -16, s: 2 }, { p: edo('pine_tree'), u: 41, v: -18, s: 2 });
    return I;
  },
};

const cyberTown: TownDef = {
  id: 'cyber', name: 'Neon Alley', area: 'newark', half: [48, 48], minH: 0.8,
  view: { stand: [0, 30], look: [0, -30, 8] }, slab: { u: 0, v: 0, w: 96, d: 96 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 3.4, height: 3.8, waterY: 0.55, tone: 'neon', jets: 16 }],
  real: [{ p: rc('realistic_warehouse_01'), u: 40, v: -34, s: 1.2, rot: -90 }, { p: rc('realistic_rail_signal_01'), u: 30, v: 38, s: 1.5 }, { p: rc('realistic_subway_faregate_01'), u: -12, v: 36, s: 1.5 }],
  items() {
    const S = 1.9, I: Item[] = [];
    { // dark wet-asphalt street (rough 0.12), dark-slate curbed sidewalks along both facades, neon seams, grates and marked kerb bays, raised island round the fountain
      const ASPH: RGB = [0.04, 0.045, 0.06], WALK: RGB = [0.13, 0.14, 0.18], KERB: RGB = [0.3, 0.31, 0.36], CY: RGB = [0.1, 0.9, 1], MG: RGB = [1, 0.1, 0.8];
      I.push(...ground([-48, -48, 48, 40], ASPH, [], { rough: 0.12 }), ...pad(-11.5, -4, 3.4, 68, WALK, KERB, { rough: 0.3 }), ...pad(11.5, -4, 3.4, 68, WALK, KERB, { rough: 0.3 }), ...pad(0, 0, 13, 13, WALK, KERB, { rough: 0.3 }));
      I.push(strip(0, -4, 0.14, 40, CY, 1.1), strip(0, 26, 0.14, 24, MG, 1.1));
      for (const v of [-30, -20, 20, 30]) I.push(strip(0, v, 17.6, 0.12, v < 0 ? CY : MG, 1.1));
      for (const [u, v, c] of [[-5, -16, CY], [5, 14, MG], [-5, 22, MG], [5, -26, CY]] as const) I.push(strip(u, v, 1.6, 0.9, c, 1.8, 0.04), strip(u, v, 1.2, 0.08, [0.02, 0.02, 0.03], 0, 0.045));
      for (const v of [-24, -17]) I.push(strip(8.6, v, 2.4, 0.1, CY, 0.9)); for (const v of [8, 15]) I.push(strip(-8.6, v, 2.4, 0.1, MG, 0.9)); // marked kerb bays
    }
    I.push(...basin(3.6, 0.7));
    // buildings tight along both facades and across the back, all facing the street
    const W = (p: string, v: number, s = S) => I.push({ p, u: -17.5, v, s, rot: face(-17.5, v, 0, v), solid: true }), E = (p: string, v: number, s = S) => I.push({ p, u: 17.5, v, s, rot: face(17.5, v, 0, v), solid: true });
    W(cy('hab_stack_tower'), -34, 2); W(cy('mixed_use_highrise'), -23, 2); W(cy('noodle_bar'), -12); W(cy('konbini_store'), 0); W(cy('ripperdoc_clinic'), 13);
    E(cy('corporate_hq_spire'), -34, 2); E(cy('hab_stack_tower'), -23, 2); E(cy('arcade_parlor'), -10); E(cy('mixed_use_highrise'), 4, 2); E(cy('noodle_bar'), 17);
    I.push({ p: cy('megatower_arcology'), u: 0, v: -43, s: 2.4, solid: true });
    for (const [u, v] of [[-13.7, -12], [-13.7, 13], [13.7, -10], [13.7, 17]] as const) I.push({ p: cy('alley_sign_cluster'), u, v, s: 1.8, y: 5.5, rot: u < 0 ? 90 : -90 });
    [-32, -20, -6, 6, 20, 28].forEach((v, i) => I.push({ p: cy('neon_lamppost'), u: i % 2 ? 11.8 : -11.8, v, s: 1.5, rot: i % 2 ? -90 : 90 }));
    I.push({ p: cy('ground_sedan'), u: 8.6, v: -20.5, s: 1.6, rot: 0 }, { p: cy('hover_car'), u: -8.6, v: 11.5, s: 1.7, rot: 0, y: 0.45 });
    // railway: a short station spur along the south edge
    I.push(...row(rw('track_road_level_tile'), -36, 44, 8, 0, 10, { s: 2, tile: true }), { p: rw('station_building'), u: -10, v: 36, s: 1.6, solid: true, rot: 180 }, { p: rw('passenger_coach'), u: 6, v: 44, s: 2, rot: 90 }, { p: rw('diesel_locomotive'), u: -8, v: 44, s: 2, rot: 90 });
    // construction site: tower crane, cabin, plant
    I.push({ p: cs('tower_crane'), u: -38, v: 40, s: 1.8, solid: true }, { p: cs('portacabin_office'), u: -26, v: 40, s: 1.5, solid: true }, { p: cs('excavator'), u: -32, v: 34, s: 1.5, rot: 60 }, { p: cs('dump_truck'), u: -24, v: 33, s: 1.4, rot: 120 });
    return I;
  },
};

const parisTown: TownDef = {
  id: 'paris', name: 'Esplanade', area: 'passaic', half: [50, 50], minH: 0.8, water: true,
  view: { stand: [0, 34], look: [0, -30, 8] }, slab: { u: 0, v: 0, w: 100, d: 100 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 4.8, height: 5.2, waterY: 1.21, tone: 'sky', jets: 18 }, { x: -22, z: 14, y: 0, radius: 0.9, height: 1.2, waterY: 0.45, tone: 'sky', jets: 6 }, { x: 22, z: 14, y: 0, radius: 0.9, height: 1.2, waterY: 0.45, tone: 'sky', jets: 6 }],
  real: benchesAround(0, 0, [[6.4, 6.4], [-6.4, 6.4], [6.4, -6.4], [-6.4, -6.4], [10.2, 0], [-10.2, 0]]),
  items() {
    const I: Item[] = [];
    { // warm stone esplanade with a radial pattern, raised granite promenade round three sides (buildings face it), tree pits
      const STONE2: RGB = [0.55, 0.5, 0.42], GRAN: RGB = [0.4, 0.4, 0.43], EDGE: RGB = [0.26, 0.26, 0.28], LIGHT: RGB = [0.7, 0.64, 0.52], DARKS: RGB = [0.36, 0.33, 0.3];
      I.push(...ground([-50, -50, 50, 37], STONE2));
      for (const [r0, r1, c] of [[6.2, 6.8, LIGHT], [9.4, 9.9, DARKS], [13, 13.6, LIGHT]] as const) I.push({ p: '', u: 0, v: 0, ring: { r0, r1, y0: 0.02, y1: 0.05, rgb: c } });
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; I.push(B(Math.cos(a) * 9.6, Math.sin(a) * 9.6, 0.3, 6.4, 0.048, DARKS, { y0: 0.02, rot: 90 - (a * 180) / Math.PI })); }
      I.push(...pad(-27.2, 0, 5.4, 52, GRAN, EDGE), ...pad(27.2, 0, 5.4, 52, GRAN, EDGE), ...pad(0, -27.2, 49, 5.4, GRAN, EDGE));
      for (const u of [-34, -18, 18, 34]) I.push(pit(u, 29));
    }
    I.push(...seams([-30, -30, 30, 30], 3.5, [0.46, 0.42, 0.36]), ...flags([-12.6, -12.6, 12.6, 12.6], 3.15, 3.15, 0.02, [0.6, 0.55, 0.46], 4141, 0.025)); // crisp warm limestone paving round the fountain ring
    for (const [u, v] of [[-25.5, -18], [-25.5, -4], [-25.5, 10], [25.5, -18], [25.5, -4], [25.5, 10]] as const) I.push({ p: pa('reverbere_01'), u, v, s: 1.5 }); // cast-iron Parisian lamps on the granite promenade
    I.push({ p: ru('roman_fountain'), u: 0, v: 0, s: 2.2, solid: false }, { p: ru('equestrian_statue'), u: 0, v: -20, s: 1.8, rot: 0 });
    // perimeter rows of Parisian frontages, facing inward onto the promenade
    const row7 = [pa('cafe_brasserie_01'), pa('boulangerie_01'), pa('librairie_01'), pa('haussmann_apartment_01'), pa('cafe_brasserie_01'), pa('boulangerie_01'), pa('librairie_01')];
    row7.forEach((p, i) => { const v = -22.5 + i * 7.5; I.push({ p, u: -33.5, v, s: 1.5, rot: face(-33.5, v, 0, v), solid: true }, { p: row7[(i + 3) % 7], u: 33.5, v, s: 1.5, rot: face(33.5, v, 0, v), solid: true }); });
    [-28.5, -19, -9.5, 0, 9.5, 19, 28.5].forEach((u, i) => I.push({ p: i === 3 ? pa('haussmann_apartment_01') : i % 2 ? pa('arcade_colonnade_01') : row7[i], u, v: -33.5, s: 1.5, rot: face(u, -33.5, u, 0), solid: true }));
    I.push({ p: pa('metro_entrance_01'), u: -24, v: 31, s: 1.5, solid: true }, { p: pa('news_kiosk_01'), u: 26.8, v: 14, s: 1.5, rot: -90 }, { p: pa('morris_column_01'), u: -26.8, v: 16, s: 1.5 });
    I.push({ p: pa('wallace_fountain_01'), u: -22, v: 14, s: 1.5 }, { p: pa('wallace_fountain_01'), u: 22, v: 14, s: 1.5 });
    I.push({ p: pa('cafe_parasol_01'), u: -26.8, v: -10, s: 1.5 }, { p: pa('cafe_parasol_01'), u: 26.8, v: 4, s: 1.5 });
    for (const u of [-34, -18, 18, 34]) I.push({ p: pa('plane_tree_01'), u, v: 29, s: 1.3 });
    // riverfront: shoreline, river and a bateau-mouche
    I.push(...row(pa('shore_straight_01'), -40, 40, 8, 0, 11, { s: 2, tile: true, rot: 180 }), ...grid(pa('water_open_01'), -40, 48, 11, 1, 8, { s: 2 }), { p: pa('bateau_mouche_boat_01'), u: 8, v: 48, s: 1.6, rot: 90, y: 0.4 });
    // cutaway shops behind the frontages, dressed with the interior kits (lit windows face the plaza)
    const SH = 1.7;
    I.push(...room(bs, 'bookshop_wall_panel', 'bookshop_window_wall', 'bookshop_floor_tile', -44, 40, { cols: 3, depth: 3, piece: 1.2, s: SH * 1.4, props: [['checkout_counter', 0, 0, 0]] }));
    I.push(...room(lb, 'library_wall_panel', 'library_wall_panel', null, -22, 40, { cols: 2, depth: 2, piece: 2, s: SH, props: [['reading_table', 0, 0, 0], ['chesterfield_sofa', 0, -3, 0]] }));
    I.push(...room(lr, 'wall_straight', 'wall_window', null, 26, 40, { cols: 4, depth: 3, piece: 1, s: SH * 1.5, props: [['sofa_3seat', 0, -2, 0], ['coffee_table', 0, 0, 0]] }));
    I.push(...room(kt, 'wall_segment', 'wall_segment', 'kitchen_floor_tile', 44, 40, { cols: 3, depth: 3, piece: 1, s: SH * 1.5, props: [['base_cabinet_door', -1, -2, 0], ['range_hood', 0, -2, 0]] }));
    I.push(...room(dr, 'dining_window_wall', 'dining_window_wall', null, -44, 22, { cols: 3, depth: 3, piece: 1.2, s: SH * 1.4, props: [['round_table', 0, 0, 0]] }));
    I.push(...room(bd, 'bedroom_wall_window', 'bedroom_wall_window', null, 44, 22, { cols: 3, depth: 3, piece: 1, s: SH * 1.5, props: [['master_bedding', 0, -1, 0]] }));
    I.push(...room(bt, 'bath_window_wall', 'bath_window_wall', null, 44, 4, { cols: 3, depth: 2, piece: 1.2, s: SH * 1.4, props: [['shower_enclosure', 1.5, -1, 0]] }));
    I.push(...room(ho, 'office_wall_corner', 'office_wall_corner', 'office_floor_wood', -44, 4, { cols: 3, depth: 2, piece: 1.2, s: SH * 1.4, props: [['l_desk', 0, -1, 0]] }));
    I.push(...row(gs('gs_sign_dept_bakery'), 12, 36, 6, 0, 3, { s: 1.6, y: 2.6 }), { p: gs('gs_bakery_awning'), u: 16, v: 36, s: 1.8 }, { p: gs('gs_checkout_counter'), u: 22, v: 38, s: 1.8 });
    return I;
  },
};

const harborTown: TownDef = {
  id: 'harbor', name: 'Old Town Harbor', area: 'keywest', half: [46, 46], minH: 0.7, water: true,
  view: { stand: [-9, 29], look: [0, -22, 6] }, slab: { u: 0, v: 0, w: 92, d: 92 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 2.4, height: 3.4, waterY: 1.55, tone: 'coral', jets: 14 }],
  real: benchesAround(0, 0, [[7.4, 7.4], [-7.4, 7.4], [7.4, -7.4], [-7.4, -7.4], [11, 0], [-11, 0]]),
  items() {
    const I: Item[] = [], S = 2;
    { // cream-coral travertine square with a tile grid and a raised perimeter curb, weathered timber boardwalk along the harbour side
      const TRAV: RGB = [0.86, 0.78, 0.66], SEAM: RGB = [0.7, 0.62, 0.5], CURB: RGB = [0.62, 0.56, 0.48], TIM: RGB = [0.4, 0.28, 0.18], TIMD: RGB = [0.24, 0.16, 0.1];
      I.push(...ground([-46, -46, 46, 20], TRAV), ...seams([-44, -44, 44, 18], 4, SEAM));
      for (const [u, v, w, d] of [[0, -45.7, 92, 0.6], [-45.7, -13, 0.6, 66], [45.7, -13, 0.6, 66]] as const) I.push(B(u, v, w, d, CURB_H, CURB, { y0: -0.1 }));
      I.push(...pad(0, 24, 88, 7, TIM, TIMD, { rough: 0.9, h: 0.09 }));
      for (let u = -42; u <= 42; u += 1.1) I.push(B(u, 24, 0.04, 6.3, 0.095, TIMD, { y0: 0.09 })); // plank seams
      I.push(...pad(0, 0, 11, 11, [0.78, 0.7, 0.58], CURB)); // raised plinth round the fountain
    }
    I.push({ p: ci('park_fountain_01'), u: 0, v: 0, s: 2 });
    I.push({ p: vb('grand_deco_hotel'), u: 0, v: -40, s: 1.3, solid: true });
    // red-tile cottages, bakery, tavern, market storefronts round the perimeter, all facing the fountain
    const W = (p: string, v: number, s = S) => I.push({ p, u: -26, v, s, rot: face(-26, v, 0, v), solid: true }), E = (p: string, v: number, s = S) => I.push({ p, u: 26, v, s, rot: face(26, v, 0, v), solid: true });
    W(cz('bld_bakery_01'), -22); W(cz('home_cottage_01'), -11, 2.2); W(cz('home_cottage_01'), 0, 2.2); W(cz('home_cottage_01'), 11, 2.2);
    E(cz('bld_tavern_inn_01'), -22); E(cz('bld_market_hall_01'), -10); E(vb('deco_shopfront_row'), 3, 1.2); E(cz('home_cottage_01'), 14, 2.2);
    [-24, -12, 8, 17].forEach((v) => I.push({ p: vb('deco_street_lamp'), u: -14.5, v, s: 1.3 }, { p: vb('deco_street_lamp'), u: 14.5, v, s: 1.3 })); // lamps along the promenade, each with its own pool
    // palms in stone tree-pits
    for (const u of [-18, 18]) for (const v of [-28, -16, -4, 4, 14]) { I.push(pit(u, v, 1.3), { p: [vb('coconut_palm'), vb('royal_palm'), vb('sabal_fan_palm')][Math.abs(u + v) % 3 | 0], u, v, s: 1.3 }); }
    // swamp-bayou boardwalk pier with boathouse out to the water side (south)
    I.push(...row(sw('road_boardwalk_straight'), 0, 28, 0, 8, 2, { s: 2, rot: 90, y: 0.25 }), { p: sw('boat_house'), u: 8, v: 42, s: 1.6, rot: 180, solid: true }, { p: sw('bayou_landing_sign'), u: 12, v: 22, s: 1.6 });
    return I;
  },
};

const airfieldTown: TownDef = {
  id: 'airfield', name: 'Airfield', area: 'keywest', half: [92, 40], minH: 0.8,
  view: { stand: [-40, 26], look: [10, -4, 4] }, slab: { u: 0, v: 0, w: 184, d: 80 },
  fountains: () => [],
  real: [{ p: rc('realistic_road_gantry_01'), u: -20, v: 4, s: 1.2 }, { p: rc('realistic_rail_signal_01'), u: 40, v: 4, s: 1.6 }],
  items() {
    const I: Item[] = [];
    { // tarmac apron kept clear for the aircraft; floodlights stand on raised concrete islands and a hangar-front sidewalk
      const TAR: RGB = [0.16, 0.16, 0.18], YEL: RGB = [0.92, 0.76, 0.1], WHT: RGB = [0.85, 0.85, 0.82], RED: RGB = [0.72, 0.1, 0.1], CONC: RGB = [0.52, 0.52, 0.5], CONCC: RGB = [0.36, 0.36, 0.35];
      I.push(...ground([-92, -12, 92, 40], TAR, [], { rough: 0.7 }));
      for (let u = -58; u < 42; u += 5) I.push(strip(u, -6, 2.6, 0.22, YEL, 0.05, 0.035));
      for (const [u, v] of [[-30, 12], [-14, 14], [2, 12], [20, 8], [44, 8], [-44, 8]] as const) I.push(strip(u, v + 1.6, 0.2, 3.2, WHT, 0.05, 0.035), strip(u, v + 3.2, 3, 0.2, WHT, 0.05, 0.035));
      for (let k = 0; k < 8; k++) I.push(strip(-84, -27 + k * 1.6, 6, 0.8, k % 2 ? RED : WHT, 0.1, 0.035));
      for (let u = -48; u < 60; u += 12) I.push(strip(u, 26, 0.25, 8, YEL, 0.05, 0.035));
      I.push(...pad(-40, 29.5, 70, 3.2, CONC, CONCC), ...pad(40, 31.5, 60, 3.2, CONC, CONCC)); // raised concrete sidewalks along the building line
    }
    I.push(...row(af('road_runway'), -88, -22, 12, 0, 15, { s: 3, tile: true, rot: 90 }), ...row(af('road_taxiway_straight'), -60, -6, 12, 0, 8, { s: 3, tile: true, rot: 90 }), ...grid(af('tarmac_tile'), -48, 6, 8, 3, 12, { s: 3 }));
    I.push({ p: af('control_tower'), u: -4, v: 34, s: 2.4, solid: true }, { p: af('hangar'), u: 38, v: 20, s: 2.2, rot: 180, solid: true }, { p: af('hangar'), u: 62, v: 20, s: 2.2, rot: 180, solid: true }, { p: af('t_hangar_block'), u: 82, v: 24, s: 2, rot: 180, solid: true }, { p: af('fire_rescue_station'), u: 20, v: 34, s: 2, rot: 180, solid: true }, { p: af('apron_canopy'), u: 0, v: 22, s: 2.2 });
    for (const [u, v, r] of [[-30, 12, 20], [-14, 14, -10], [2, 12, 60], [20, 8, 0], [44, 8, 30], [-44, 8, -30]] as const) I.push({ p: af('light_aircraft_cessna'), u, v, s: 2, rot: r });
    I.push({ p: af('fuel_truck'), u: 8, v: 22, s: 1.8, rot: 90 });
    for (const u of [-66, -48, -30, -12]) I.push({ p: af('apron_floodlight'), u, v: 29.5, s: 1.7, rot: 180 }); // on the concrete sidewalk, never on the aircraft apron
    for (const u of [30, 50, 70]) I.push({ p: af('apron_floodlight'), u, v: 31.5, s: 1.7, rot: 180 });
    I.push(...row(af('approach_light_bar'), -88, -30, 0, 0, 1, { s: 2 }), ...row(af('approach_light_bar'), -90, -22, -4, 0, 1, { s: 2 }), ...row(af('runway_edge_light'), -84, -30, 8, 0, 21, { s: 2.2 }), ...row(af('runway_edge_light'), -84, -14, 8, 0, 21, { s: 2.2 }), ...row(af('taxiway_blue_light'), -56, -10, 8, 0, 14, { s: 2.2 }), ...row(af('taxiway_blue_light'), -56, -2, 8, 0, 14, { s: 2.2 }));
    I.push({ p: af('windsock'), u: 90, v: -10, s: 2 }, { p: af('windsock'), u: -90, v: -10, s: 2 }, { p: af('rotating_beacon'), u: 4, v: 34, s: 2, y: 25 });
    I.push(...scatter([af('perimeter_shrub'), af('reed_clump'), af('wildflower_scatter'), af('infield_grass_tuft')], 18, [-90, -36, 90, -26], 5, 1.5, 2.2));
    return I;
  },
};

const outpostTown: TownDef = {
  id: 'outpost', name: 'Pine Outpost', area: 'sandyhook', half: [60, 60], minH: 0.9,
  view: { stand: [0, 40], look: [0, -20, 5] }, slab: { u: 0, v: 14, w: 36, d: 36 },
  fountains: () => [{ x: -26, z: -4, y: 0, radius: 3.4, height: 3.0, waterY: 0.9, tone: 'sky', jets: 10 }],
  real: [{ p: rc('realistic_rock_boulder_01'), u: -34, v: 6, s: 2 }, { p: rc('realistic_rock_boulder_01'), u: 10, v: 34, s: 1.6 }, { p: rc('realistic_rock_boulder_01'), u: -40, v: -22, s: 2.4 }],
  items() {
    const I: Item[] = [];
    // pads sit under what they carry: (u, v, w, d)
    const PADS: [number, number, number, number][] = [[14, 8, 8, 8], [30, -22, 6, 6], [-44, -34, 14, 12], [-30, -46, 8, 8], [8, -42, 14, 12], [-8, -46, 8, 7], [36, 30, 19, 14], [44, 12, 9, 9], [28, -46, 9, 6], [46, -30, 8, 8], [40, -40, 7, 7], [-22, 34, 12, 12], [-46, 33, 18, 9], [-9.2, 25, 3, 3]];
    { // packed dirt clearing, weathered stone / packed-earth pads under every structure, timber dock planks by the wharf
      const DIRT: RGB = [0.27, 0.2, 0.14], FLG: RGB = [0.41, 0.4, 0.37], FLGC: RGB = [0.28, 0.28, 0.26], PLANK: RGB = [0.37, 0.25, 0.15], PLKD: RGB = [0.22, 0.15, 0.09];
      I.push(...ground([-16, -6, 16, 34], DIRT, [], { rough: 0.95 }), ...ground([-6, 34, 6, 46], DIRT, [], { rough: 0.95 }));
      for (const [u, v, w, d] of PADS) I.push(...pad(u, v, w, d, FLG, FLGC, { rough: 0.95 }));
      I.push(...pad(50, 25, 9, 16, PLANK, PLKD, { rough: 0.9, h: 0.1 }));
      for (let k = -3; k <= 3; k++) I.push(B(50, 25 + k * 2, 8.2, 0.05, 0.105, PLKD, { y0: 0.1 }));
    }
    const clear = (u: number, v: number) => Math.hypot(u + 26, v + 4) > 6 && !(Math.abs(u) < 14 && Math.abs(v - 14) < 18) && !PADS.some(([pu, pv, w, d]) => Math.abs(u - pu) < w / 2 + 3 && Math.abs(v - pv) < d / 2 + 3);
    I.push(...grid(na('dirt_trail'), -4, 4, 1, 6, 8, { s: 2, rot: 90 }));
    // waterfall pond with a cascade (animated)
    I.push({ p: au('reflecting_pond'), u: -26, v: -4, s: 2, tile: true }, { p: na('waterfall'), u: -26, v: -14, s: 2, solid: true }, { p: na('lichen_granite_boulder'), u: -32, v: -8, s: 2 });
    I.push({ p: na('ranger_hut'), u: 14, v: 8, s: 2.4, rot: -90, solid: true }, { p: na('lookout_tower'), u: 30, v: -22, s: 1.8, solid: true });
    I.push({ p: fm('windmill_pump'), u: -10, v: 26, s: 1.6 }); // farm pack: a hand pump on the packed-dirt clearing
    I.push({ p: cz('streetlamp_01'), u: 10.2, v: 11.2, s: 1.5, y: 0 }, { p: cz('streetlamp_01'), u: -8.5, v: 24, s: 1.5, y: 0 }); // ground-standing lamp posts: beside the ranger hut and the pump (no floating props)
    // viking-fjord wharf village on the lee side
    I.push({ p: vk('turf_longhouse'), u: 36, v: 30, s: 2.4, rot: -90, solid: true }, { p: vk('pit_house'), u: 44, v: 12, s: 2, rot: -90, solid: true }, { p: vk('boathouse_naust'), u: 56, v: 38, s: 2, rot: -90, solid: true });
    I.push({ p: cz('streetlamp_01'), u: 46.5, v: 20, s: 1.5, y: 0.1 }, { p: cz('streetlamp_01'), u: 46.5, v: 30, s: 1.5, y: 0.1 }); // wharf lamps stand on the planks
    // bunker + radar compound
    I.push(...row(bk('corridor_straight'), -46, 33, 4, 0, 4, { s: 2 }), { p: bk('blast_door_frame'), u: -46, v: 33, s: 2, rot: 90 }, { p: bk('blast_door'), u: -46, v: 33, s: 2, rot: 90 }, { p: bk('radar_scope'), u: -44, v: 40, s: 4 }, { p: bk('alarm_beacon'), u: -46, v: 37, s: 3, y: 4 });
    I.push({ p: ar('weather_mast'), u: -22, v: 38, s: 2.4, solid: true }, { p: ar('generator_hut'), u: -20, v: 30, s: 2, solid: true }, { p: ar('station_sign'), u: -26, v: 46, s: 2 });
    // ruin & folly trail along the peninsula
    I.push({ p: dk('sphinx_statue'), u: 40, v: -40, s: 2 }, { p: dk('pylon_gateway'), u: 28, v: -46, s: 1.8, solid: true }, { p: dk('mudbrick_house'), u: 46, v: -30, s: 2, solid: true });
    I.push({ p: wl('collapsed_office_ruin'), u: -44, v: -34, s: 1.8, solid: true }, { p: wl('bunker'), u: -30, v: -46, s: 1.8, solid: true }, { p: wl('dead_tree'), u: -38, v: -26, s: 1.6 });
    I.push({ p: hw('spooky_cottage_01'), u: 8, v: -42, s: 2, solid: true }, { p: hw('crypt_tomb_01'), u: -8, v: -46, s: 2, solid: true }, { p: hw('gnarled_face_tree_01'), u: 16, v: -38, s: 2 }, { p: hp('desk_writing'), u: 6, v: -42, s: 1.8 }, { p: hp('cabinet_curio'), u: 11, v: -44, s: 1.8, rot: 180 }, { p: hp('sofa_2seat'), u: 9, v: -39, s: 1.8, rot: 180 });
    I.push({ p: dg('dun_stone_well'), u: -12, v: -30, s: 2 }, { p: dg('dun_cell_bar_wall'), u: -18, v: -28, s: 1.8 }, { p: dg('dun_arcade_bay'), u: -22, v: -26, s: 1.8 });
    // forest: nature trees plus cheap fjord / village conifers
    I.push(...scatter([na('pine')], 8, [-58, -58, 58, 58], 7, 1.1, 1.6, clear), ...scatter([na('oak'), na('maple_autumn')], 4, [-58, -58, 58, 58], 9, 1.1, 1.5, clear));
    I.push(...scatter([vk('spruce_tree'), cz('tree_pine_01'), vk('birch_tree')], 46, [-58, -58, 58, 58], 3, 1.6, 2.6, clear), ...scatter([au('golden_birch')], 2, [-58, -58, 58, 58], 11, 1.2, 1.5, clear));
    return I;
  },
};

export const townDefs: TownDef[] = [edoTown, cyberTown, parisTown, harborTown, airfieldTown, outpostTown];
