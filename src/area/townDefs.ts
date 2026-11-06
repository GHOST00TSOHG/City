/** Layout data for the six towns (local metres around the town centre: u east, v south; rot in degrees about Y, 0 = model front toward +v / south).
 *  Every model path here is a pack file under public/tja/ (tools/stage-used-tja.mjs reads this file to build the ship list). */
export interface Item {
  p: string; u: number; v: number; rot?: number; s?: number; sy?: number; y?: number;
  /** ground tile: top surface flush with the paved plaza level (pad.y + 0.03) */ tile?: boolean;
  /** adds a collider box from the model's size */ solid?: boolean;
  box?: { w: number; d: number; y0?: number; y1: number; rgb: [number, number, number]; rough?: number; emissive?: number };
  ring?: { r0: number; r1: number; y0?: number; y1: number; rgb: [number, number, number] };
}
export interface FountainDef { x: number; z: number; y: number; radius: number; height: number; waterY: number; tone: 'sky' | 'neon' | 'coral' | 'gold'; jets?: number }
export interface TownDef {
  id: string; name: string; area: string; half: [number, number]; minH: number; water?: boolean;
  view?: { stand: [number, number]; look: [number, number, number] };
  slab?: { u: number; v: number; w: number; d: number };
  items(): Item[]; fountains(y: number): FountainDef[];
  /** photoreal textured `realistic-city` models (their own PBR textures, instanced; a few draw calls) */ real?: { p: string; u: number; v: number; rot?: number; s?: number }[];
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

const edoTown: TownDef = {
  id: 'edo', name: 'Edo', area: 'bayshore', half: [46, 46], minH: 1.0,
  view: { stand: [0, 30], look: [0, -22, 6] }, slab: { u: 0, v: 0, w: 24, d: 88 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 2.0, height: 3.2, waterY: 0.7, tone: 'gold', jets: 12 }, { x: -24, z: 8, y: 0, radius: 2.6, height: 1.2, waterY: 0.55, tone: 'sky', jets: 8 }],
  real: [{ p: rc('realistic_rock_boulder_01'), u: -40, v: -20, s: 2 }, { p: rc('realistic_rock_boulder_01'), u: 40, v: 24, s: 1.6 }],
  items() {
    const S = 2.2, I: Item[] = [];
    I.push(...grid(edo('raked_gravel_tile'), -8, -8, 3, 3, 8, { s: 2 }));
    I.push(...row(edo('road_stone_straight'), 0, 16, 0, 8, 4, { s: 2, tile: true, rot: 90 }), ...row(edo('road_stone_straight'), 0, -16, 0, -8, 3, { s: 2, tile: true, rot: 90 }));
    I.push(...grid(edo('moss_tile'), 16, -8, 1, 3, 8, { s: 2 }));
    I.push({ p: edo('koi_pond_tile'), u: -24, v: 8, s: 2, tile: true }, { p: edo('koi_pond_tile'), u: -24, v: 16, s: 2, tile: true }, ...row(edo('garden_stream_tile'), -24, -8, 0, -8, 3, { s: 2, tile: true }));
    I.push({ p: edo('arched_bridge'), u: -24, v: -12, s: 2.2, rot: 90 }, { p: edo('chozuya_pavilion'), u: 0, v: 0, s: S });
    I.push({ p: edo('great_torii'), u: 0, v: 40, s: S }, { p: edo('great_torii'), u: 0, v: 28, s: S });
    for (const v of [34, 22, 10]) I.push({ p: edo('stone_lantern'), u: -7, v, s: 2 }, { p: edo('stone_lantern'), u: 7, v, s: 2 });
    for (const v of [38, 26, 14, 2]) I.push({ p: edo('andon_lantern_post'), u: -11, v, s: 2 }, { p: edo('andon_lantern_post'), u: 11, v, s: 2 });
    I.push({ p: edo('shinto_shrine'), u: 0, v: -37, s: S, solid: true }, { p: edo('komainu_pair'), u: 0, v: -27, s: 2 }, { p: edo('worship_hall'), u: -20, v: -34, s: S, rot: 20, solid: true });
    I.push({ p: edo('multi_tier_pagoda'), u: -32, v: -28, s: 1.7, solid: true }, { p: edo('shoro_bell_tower'), u: 32, v: -30, s: 1.9, solid: true });
    I.push({ p: edo('machiya_townhouse'), u: 26, v: 18, s: S, rot: face(26, 18, 0, 18), solid: true }, { p: edo('merchant_shop'), u: 26, v: 6, s: S, rot: face(26, 6, 0, 6), solid: true }, { p: edo('teahouse'), u: 26, v: -6, s: S, rot: face(26, -6, 0, -6), solid: true });
    I.push({ p: edo('noodle_shop'), u: -28, v: 30, s: S, rot: face(-28, 30, 0, 30), solid: true });
    I.push();
    I.push({ p: edo('karesansui_center'), u: 18, v: -22, s: 2 });
    I.push();
    I.push();
    I.push();
    I.push({ p: edo('maple_tree'), u: -36, v: 24, s: 2 }, { p: edo('maple_tree'), u: 36, v: 8, s: 2 }, { p: edo('maple_tree'), u: 12, v: -36, s: 2.2 }, { p: edo('pine_tree'), u: -38, v: -14, s: 2 }, { p: edo('pine_tree'), u: 38, v: -26, s: 2 });
    I.push();
    return I;
  },
};

const cyberTown: TownDef = {
  id: 'cyber', name: 'Neon Alley', area: 'newark', half: [48, 48], minH: 0.8,
  view: { stand: [0, 30], look: [0, -30, 10] }, slab: { u: 0, v: 0, w: 96, d: 96 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 3.4, height: 3.8, waterY: 0.55, tone: 'neon', jets: 16 }],
  real: [{ p: rc('realistic_warehouse_01'), u: 40, v: -34, s: 1.2, rot: -90 }, { p: rc('realistic_rail_signal_01'), u: 30, v: 38, s: 1.5 }, { p: rc('realistic_subway_faregate_01'), u: -12, v: 36, s: 1.5 }],
  items() {
    const S = 1.9, I: Item[] = [];
    I.push(...grid(cy('wet_street_tile'), -40, -40, 11, 11, 8, { s: 2 }).filter((t) => Math.abs(t.u) > 8 || Math.abs(t.v) > 8 ? ((t.u + 40) / 8) % 2 === 0 || ((t.v + 40) / 8) % 2 === 0 : false));
    I.push(...basin(3.6, 0.7));
    I.push({ p: cy('noodle_bar'), u: -22, v: -12, s: S, rot: face(-22, -12, 0, -12), solid: true }, { p: cy('arcade_parlor'), u: 22, v: -12, s: S, rot: face(22, -12, 0, -12), solid: true }, { p: cy('ripperdoc_clinic'), u: -22, v: 10, s: S, rot: face(-22, 10, 0, 10), solid: true }, { p: cy('konbini_store'), u: 22, v: 10, s: S, rot: face(22, 10, 0, 10), solid: true });
    I.push({ p: cy('megatower_arcology'), u: 0, v: -42, s: 2.4, solid: true }, { p: cy('hab_stack_tower'), u: -34, v: -38, s: 2, solid: true }, { p: cy('hab_stack_tower'), u: 34, v: -38, s: 2, solid: true }, { p: cy('mixed_use_highrise'), u: -42, v: -14, s: 2, solid: true }, { p: cy('corporate_hq_spire'), u: 42, v: -14, s: 2, solid: true });
    for (const [u, v] of [[-11, -12], [11, -12], [-11, 10], [11, 10]] as const) I.push({ p: cy('alley_sign_cluster'), u, v, s: 1.8, y: 5.5, rot: u < 0 ? 90 : -90 });
    I.push({ p: cy('holo_billboard'), u: 16, v: -24, s: 1.6, y: 2 });
    I.push({ p: cy('hover_car'), u: -4, v: 18, s: 1.7, rot: 90, y: 1.3 }, { p: cy('ground_sedan'), u: 4, v: -20, s: 1.6, rot: 0 });
    I.push();
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
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 4.8, height: 5.2, waterY: 1.15, tone: 'sky', jets: 18 }, { x: -22, z: 14, y: 0, radius: 0.9, height: 1.2, waterY: 0.9, tone: 'sky', jets: 6 }, { x: 22, z: 14, y: 0, radius: 0.9, height: 1.2, waterY: 0.9, tone: 'sky', jets: 6 }],
  real: [{ p: rc('realistic_brownstone_01'), u: -46, v: -2, s: 0.8, rot: 90 }, { p: rc('realistic_bench_01'), u: 4, v: 24, s: 1.6, rot: 180 }],
  items() {
    const I: Item[] = [];
    I.push(...grid(pa('cobblestone_place_01'), -28, -28, 8, 8, 8, { s: 2 }));
    I.push({ p: ru('roman_fountain'), u: 0, v: 0, s: 2.2, solid: false }, { p: ru('equestrian_statue'), u: 0, v: -22, s: 1.8, rot: 0 }, { p: ru('amphitheater_segment'), u: 0, v: -42, s: 1.2, rot: 180, solid: true });
    I.push(...row(ru('ionic_column'), -30, -26, 12, 0, 6, { s: 1.5 }));
    I.push({ p: pa('arcade_colonnade_01'), u: -26, v: -36, s: 1.5, rot: 0, solid: true }, { p: pa('cafe_brasserie_01'), u: -34, v: -8, s: 1.5, rot: face(-34, -8, 0, -8), solid: true }, { p: pa('boulangerie_01'), u: 34, v: -8, s: 1.5, rot: face(34, -8, 0, -8), solid: true }, { p: pa('librairie_01'), u: -34, v: 12, s: 1.5, rot: face(-34, 12, 0, 12), solid: true });
    I.push({ p: pa('haussmann_apartment_01'), u: -44, v: -26, s: 1.5, rot: 60, solid: true }, { p: pa('haussmann_apartment_01'), u: 44, v: -26, s: 1.5, rot: -60, solid: true }, { p: pa('metro_entrance_01'), u: -24, v: 30, s: 1.5, solid: true }, { p: pa('news_kiosk_01'), u: 10, v: 14, s: 1.5 }, { p: pa('morris_column_01'), u: -10, v: 14, s: 1.5 });
    I.push({ p: pa('wallace_fountain_01'), u: -22, v: 14, s: 1.5 }, { p: pa('wallace_fountain_01'), u: 22, v: 14, s: 1.5 });
    for (const [u, v] of [[-30, 2], [-28, 6], [-30, 10], [30, 2], [28, 6]] as const) I.push();
    I.push({ p: pa('cafe_parasol_01'), u: -29, v: 4, s: 1.5 }, { p: pa('cafe_parasol_01'), u: 29, v: 4, s: 1.5 });
    I.push(...row(pa('plane_tree_01'), -40, 22, 16, 0, 6, { s: 1.4 }));
    // riverfront: shoreline, river and a bateau-mouche
    I.push(...row(pa('shore_straight_01'), -40, 40, 8, 0, 11, { s: 2, tile: true, rot: 180 }), ...grid(pa('water_open_01'), -40, 48, 11, 1, 8, { s: 2 }), { p: pa('bateau_mouche_boat_01'), u: 8, v: 48, s: 1.6, rot: 90, y: 0.4 });
    // cutaway shops along the west side, dressed with the interior kits (lit windows face the plaza)
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
  view: { stand: [-13, 22], look: [0, -22, 6] }, slab: { u: 0, v: 0, w: 92, d: 92 },
  fountains: () => [{ x: 0, z: 0, y: 0, radius: 2.4, height: 3.4, waterY: 0.85, tone: 'coral', jets: 14 }, { x: 22, z: 30, y: 0, radius: 1.2, height: 0.8, waterY: 0.2, tone: 'sky', jets: 6 }],
  real: [{ p: rc('realistic_bench_01'), u: 10, v: -8, s: 1.6, rot: 0 }, { p: rc('realistic_bench_01'), u: -10, v: -8, s: 1.6, rot: 0 }],
  items() {
    const I: Item[] = [], S = 2;
    I.push(...grid(cz('road_cobble_straight_01'), -32, -32, 9, 9, 8, { s: 2 }));
    I.push({ p: ci('park_fountain_01'), u: 0, v: 0, s: 2 }, { p: cz('well_01'), u: -22, v: 22, s: 2 }, { p: cz('water_pond_01'), u: 22, v: 30, s: 2, tile: true });
    I.push({ p: vb('grand_deco_hotel'), u: 0, v: -40, s: 1.3, solid: true }, { p: vb('deco_shopfront_row'), u: 38, v: 0, s: 1.2, rot: -90, solid: true });
    I.push({ p: cz('bld_bakery_01'), u: -26, v: -14, s: S, rot: face(-26, -14, 0, -14), solid: true }, { p: cz('bld_tavern_inn_01'), u: 26, v: -14, s: S, rot: face(26, -14, 0, -14), solid: true }, { p: cz('bld_market_hall_01'), u: 26, v: 6, s: S, rot: face(26, 6, 0, 6), solid: true });
    I.push();
    I.push({ p: fm('greenhouse'), u: -36, v: 24, s: 1.5, solid: true }, { p: fm('farm_gate_sign'), u: -30, v: 36, s: 1.5 }, { p: fm('windmill_pump'), u: -42, v: 14, s: 1.6 });
    // swamp-bayou boardwalk pier with boathouse out to the water side (south)
    I.push(...row(sw('road_boardwalk_straight'), 0, 24, 0, 8, 3, { s: 2, rot: 90, y: 0.25 }), { p: sw('boat_house'), u: 8, v: 40, s: 1.6, rot: 180, solid: true }, { p: sw('bayou_landing_sign'), u: 0, v: 20, s: 1.6 });
    // palms: only here, in Key West
    const pl = [vb('coconut_palm'), vb('royal_palm'), vb('sabal_fan_palm')];
    I.push(...scatter(pl, 22, [-44, -44, 44, 44], 31, 1.1, 1.6, (u, v) => Math.hypot(u, v) > 8 && Math.abs(u) < 44), { p: vb('beach_umbrella'), u: 18, v: 18, s: 1.6 });
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
    I.push(...row(af('road_runway'), -88, -22, 12, 0, 15, { s: 3, tile: true, rot: 90 }), ...row(af('road_taxiway_straight'), -60, -6, 12, 0, 8, { s: 3, tile: true, rot: 90 }), ...grid(af('tarmac_tile'), -48, 6, 8, 3, 12, { s: 3 }));
    I.push({ p: af('control_tower'), u: -4, v: 34, s: 2.4, solid: true }, { p: af('hangar'), u: 38, v: 20, s: 2.2, rot: 180, solid: true }, { p: af('hangar'), u: 62, v: 20, s: 2.2, rot: 180, solid: true }, { p: af('t_hangar_block'), u: 82, v: 24, s: 2, rot: 180, solid: true }, { p: af('fire_rescue_station'), u: 20, v: 34, s: 2, rot: 180, solid: true }, { p: af('apron_canopy'), u: 0, v: 22, s: 2.2 });
    for (const [u, v, r] of [[-30, 12, 20], [-14, 14, -10], [2, 12, 60], [20, 8, 0], [44, 8, 30], [-44, 8, -30]] as const) I.push({ p: af('light_aircraft_cessna'), u, v, s: 2, rot: r });
    I.push({ p: af('fuel_truck'), u: 8, v: 22, s: 1.8, rot: 90 });
    I.push(...row(af('apron_floodlight'), -50, 18, 20, 0, 6, { s: 1.7 }), ...row(af('approach_light_bar'), -88, -30, 0, 0, 1, { s: 2 }), ...row(af('approach_light_bar'), -90, -22, -4, 0, 1, { s: 2 }), ...row(af('runway_edge_light'), -84, -30, 8, 0, 21, { s: 2.2 }), ...row(af('runway_edge_light'), -84, -14, 8, 0, 21, { s: 2.2 }), ...row(af('taxiway_blue_light'), -56, -10, 8, 0, 14, { s: 2.2 }), ...row(af('taxiway_blue_light'), -56, -2, 8, 0, 14, { s: 2.2 }));
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
    const clear = (u: number, v: number) => Math.hypot(u + 26, v + 4) > 6 && !(Math.abs(u) < 14 && Math.abs(v - 14) < 18);
    I.push(...grid(na('dirt_trail'), -4, 4, 1, 6, 8, { s: 2, rot: 90 }));
    // waterfall pond with a cascade (animated)
    I.push({ p: au('reflecting_pond'), u: -26, v: -4, s: 2, tile: true }, { p: na('waterfall'), u: -26, v: -14, s: 2, solid: true }, { p: na('lichen_granite_boulder'), u: -32, v: -8, s: 2 });
    I.push({ p: na('ranger_hut'), u: 14, v: 8, s: 2.4, rot: -90, solid: true }, { p: na('lookout_tower'), u: 30, v: -22, s: 1.8, solid: true });
    // viking-fjord wharf village on the lee side
    I.push({ p: vk('turf_longhouse'), u: 36, v: 30, s: 2.4, rot: -90, solid: true }, { p: vk('pit_house'), u: 44, v: 12, s: 2, rot: -90, solid: true }, { p: vk('boathouse_naust'), u: 50, v: 38, s: 2, rot: -90, solid: true });
    // bunker + radar compound
    I.push(...row(bk('corridor_straight'), -46, 30, 4, 0, 4, { s: 2 }), { p: bk('blast_door_frame'), u: -46, v: 30, s: 2, rot: 90 }, { p: bk('blast_door'), u: -46, v: 30, s: 2, rot: 90 }, { p: bk('radar_scope'), u: -44, v: 40, s: 4 }, { p: bk('alarm_beacon'), u: -46, v: 36, s: 3, y: 4 });
    I.push({ p: ar('weather_mast'), u: -22, v: 38, s: 2.4, solid: true }, { p: ar('generator_hut'), u: -20, v: 30, s: 2, solid: true }, { p: ar('station_sign'), u: -26, v: 46, s: 2 });
    // ruin & folly trail along the peninsula
    I.push({ p: dk('sphinx_statue'), u: 40, v: -40, s: 2 }, { p: dk('pylon_gateway'), u: 28, v: -46, s: 1.8, solid: true }, { p: dk('mudbrick_house'), u: 46, v: -30, s: 2, solid: true });
    I.push({ p: wl('collapsed_office_ruin'), u: -44, v: -34, s: 1.8, solid: true }, { p: wl('bunker'), u: -30, v: -46, s: 1.8, solid: true }, { p: wl('dead_tree'), u: -36, v: -26, s: 1.6 });
    I.push({ p: hw('spooky_cottage_01'), u: 8, v: -42, s: 2, solid: true }, { p: hw('crypt_tomb_01'), u: -8, v: -46, s: 2, solid: true }, { p: hw('gnarled_face_tree_01'), u: 16, v: -38, s: 2 }, { p: hp('desk_writing'), u: 6, v: -42, s: 1.8 }, { p: hp('cabinet_curio'), u: 11, v: -44, s: 1.8, rot: 180 }, { p: hp('sofa_2seat'), u: 9, v: -39, s: 1.8, rot: 180 });
    I.push({ p: dg('dun_stone_well'), u: -12, v: -30, s: 2 }, { p: dg('dun_cell_bar_wall'), u: -18, v: -28, s: 1.8 }, { p: dg('dun_arcade_bay'), u: -22, v: -26, s: 1.8 });
    // forest: nature trees plus cheap fjord / village conifers
    I.push(...scatter([na('pine')], 8, [-58, -58, 58, 58], 7, 1.1, 1.6, clear), ...scatter([na('oak'), na('maple_autumn')], 4, [-58, -58, 58, 58], 9, 1.1, 1.5, clear));
    I.push(...scatter([vk('spruce_tree'), cz('tree_pine_01'), vk('birch_tree')], 46, [-58, -58, 58, 58], 3, 1.6, 2.6, clear), ...scatter([au('golden_birch')], 2, [-58, -58, 58, 58], 11, 1.2, 1.5, clear));
    return I;
  },
};

export const townDefs: TownDef[] = [edoTown, cyberTown, parisTown, harborTown, airfieldTown, outpostTown];
