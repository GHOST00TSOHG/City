// Height, roof and colour inference for buildings. Pure, deterministic (hash of the feature id).
// Documented in knowledge/BAKE-PIPELINE.md. Order: explicit OSM tags > Overture estimate > type/footprint heuristics.
import { hash32 } from './lib.mjs';

const num = (s) => {
  if (s == null) return NaN;
  const t = String(s).trim().replace(',', '.');
  const ft = t.match(/^([\d.]+)\s*(ft|')/i); if (ft) return Number(ft[1]) * 0.3048;
  const m = t.match(/^-?[\d.]+/); return m ? Number(m[0]) : NaN;
};
const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'residential', 'bungalow', 'static_caravan', 'hut', 'cabin', 'farm', 'villa', 'dormitory']);
const SMALL = new Set(['shed', 'garage', 'garages', 'kiosk', 'hut', 'toilets', 'storage_tank', 'service', 'bunker', 'container', 'guardhouse']);
const CANOPY = new Set(['roof', 'carport', 'canopy']);
const ROOF_ALIASES = { gabled: 'gabled', hipped: 'hipped', 'half-hipped': 'hipped', side_hipped: 'hipped', quadruple_saltbox: 'hipped', saltbox: 'gabled', gambrel: 'gabled', mansard: 'hipped', pyramidal: 'pyramidal', skillion: 'skillion', lean_to: 'skillion', flat: 'flat', dome: 'dome', onion: 'dome', round: 'gabled', many: 'flat' };

// Real-world palettes (sRGB hex). Key West: painted wood conch houses, galvanised 5V-crimp metal roofs.
const PALETTES = {
  keywest: {
    houseWall: [0xf4f1ea, 0xf6f0dc, 0xeee5c8, 0xdcebe0, 0xd8e6ee, 0xf2dede, 0xf5e7c6, 0xe9efe9, 0xffffff, 0xf0ece4],
    commWall: [0xefe8da, 0xe6dcc8, 0xf3efe6, 0xd9cfbe, 0xece2cf, 0xf6f4ef],
    pitchedRoof: [0xb4b8bb, 0xa9aeb2, 0xc2c5c7, 0x9ea3a7, 0xd9dbdc, 0x8f6f5c],
    flatRoof: [0xb9b7b0, 0xa7a59f, 0xcfcdc6, 0x8e8c86],
  },
  // New Jersey: vinyl/clapboard siding and red-brown brick; asphalt-shingle roofs (dark grey, brown).
  nj: {
    houseWall: [0xe9e6de, 0xd8d4c8, 0xc9cfd2, 0xb7c2c8, 0xd9cdb4, 0xf1eee6, 0xa8b3a4, 0xcbb8a0, 0x9c5a46, 0xe4dccb],
    commWall: [0x9a5844, 0x8a4c3c, 0xb7a68e, 0xc9c1b2, 0xa9a397, 0xd8d0c0, 0x7d6a5a],
    pitchedRoof: [0x4a4b4e, 0x5b5652, 0x3f4144, 0x6a5b50, 0x55585c, 0x7a4b3a],
    flatRoof: [0x8e8c86, 0x7d7b76, 0xa09e98, 0x6e6d69],
  },
  default: {
    houseWall: [0xe8e2d6, 0xd9d2c4, 0xc8bca8, 0xb9a48c, 0xf0ece4, 0xa9b0b5],
    commWall: [0xcfc7b8, 0xb8b2a6, 0xd8d2c6, 0x9e9a92],
    pitchedRoof: [0x5d5a57, 0x6b4f43, 0x4b4d50, 0x7a6a5e],
    flatRoof: [0x8e8c86, 0x7d7b76, 0xa09e98],
  },
};
const CSS = { white: 0xf4f4f2, black: 0x2b2b2b, grey: 0x9a9a9a, gray: 0x9a9a9a, silver: 0xc0c0c0, red: 0xa8463b, brown: 0x7a5a44, beige: 0xe6dcc3, yellow: 0xf0e2a0, blue: 0x8fb0cf, green: 0x8fb59a, pink: 0xf0c8c8, orange: 0xe0a070, cream: 0xf3ecd6, tan: 0xd2b48c, maroon: 0x6e2b2b, darkgrey: 0x5a5a5a, lightgrey: 0xd3d3d3 };
function parseColour(s) {
  if (!s) return null; s = String(s).trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return parseInt(s.replace('#', ''), 16);
  if (/^#[0-9a-f]{3}$/.test(s)) return parseInt(s.slice(1).split('').map((c) => c + c).join(''), 16);
  return CSS[s.replace(/[\s_-]/g, '')] ?? null;
}
const pick = (arr, h) => arr[h % arr.length];

/**
 * @param t OSM-style tags; @param area footprint m²; @param dims {long, short} of the oriented bounding box (m)
 * @param est optional Overture estimate {height, floors}; @param palette area palette key
 */
export function inferBuilding(t, area, dims, idStr, est, palette = 'default') {
  const P = PALETTES[palette] ?? PALETTES.default, h = hash32(idStr);
  const type = t['building:part'] && t['building:part'] !== 'yes' ? t['building:part'] : (t.building ?? 'yes');
  const notes = [];
  // Kind: what this footprint most likely is.
  let kind = type;
  if (type === 'yes' || type === 'part') {
    if (area < 22) kind = 'shed';
    else if (area < 320) kind = 'house';
    else if (area < 1500) kind = 'commercial';
    else kind = 'large';
  }
  if (HOUSE.has(kind)) kind = 'house';
  const residential = kind === 'house';

  // ---- roof shape
  let roof = ROOF_ALIASES[t['roof:shape']] ?? null;
  if (roof) notes.push('roof:tag');
  else if (CANOPY.has(type)) roof = 'flat';
  else if (residential && area >= 22 && area < 450) roof = dims.long / Math.max(dims.short, 1) > 1.35 ? 'gabled' : 'hipped';
  else if ((kind === 'commercial' || type === 'retail') && area < 260) roof = dims.long / Math.max(dims.short, 1) > 1.35 ? 'gabled' : 'hipped';
  else if (type === 'church' || type === 'chapel') roof = 'gabled';
  else if (kind === 'shed' || SMALL.has(type)) roof = area < 40 ? 'skillion' : 'gabled';
  else roof = 'flat';

  // ---- roof height (pitched ~ 25-30 degrees across the short side)
  let roofH = num(t['roof:height']);
  if (!(roofH >= 0)) {
    const levelsR = num(t['roof:levels']);
    if (levelsR > 0) roofH = levelsR * 2.6;
    else if (roof === 'gabled' || roof === 'hipped') roofH = Math.min(4.5, Math.max(0.9, dims.short * 0.5 * 0.53));
    else if (roof === 'pyramidal') roofH = Math.min(5, Math.max(1, dims.short * 0.5 * 0.65));
    else if (roof === 'skillion') roofH = Math.min(1.5, Math.max(0.4, dims.short * 0.18));
    else if (roof === 'dome') roofH = Math.min(12, dims.short * 0.5);
    else roofH = 0;
  }

  // ---- total height
  const floorH = residential ? 2.9 : (kind === 'industrial' || kind === 'warehouse') ? 4.5 : 3.6;
  let height = num(t.height), minH = num(t['min_height']);
  const levels = num(t['building:levels']), minLevel = num(t['building:min_level']);
  if (height > 0) notes.push('height:tag');
  else if (levels > 0) { height = levels * floorH + 0.6 + roofH; notes.push('levels:tag'); }
  else if (est?.height > 2 && est.height < 120) { height = Math.max(est.height, roofH + 2.4); notes.push('overture'); }
  else if (est?.floors > 0) { height = est.floors * floorH + 0.6 + roofH; notes.push('overture:floors'); }
  else {
    notes.push('default');
    let lv;
    if (CANOPY.has(type)) { height = 3; minH = 2.4; }
    else if (kind === 'shed' || SMALL.has(type)) height = 2.7 + roofH;
    else if (residential) { const p2 = area < 80 ? 0.05 : area < 150 ? 0.3 : 0.55; lv = (h % 100) / 100 < p2 ? 2 : 1; height = lv * floorH + 0.6 + roofH; }
    else if (kind === 'apartments') height = (area > 900 ? 4 : 3) * floorH + roofH;
    else if (kind === 'hotel') height = (area > 2500 ? 5 : area > 900 ? 3 : 2) * floorH + roofH;
    else if (kind === 'church' || kind === 'chapel' || kind === 'cathedral') height = 9 + roofH;
    else if (kind === 'school' || kind === 'civic' || kind === 'public' || kind === 'government' || kind === 'office') height = 2 * floorH + roofH;
    else if (kind === 'industrial' || kind === 'warehouse' || kind === 'hangar') height = 7;
    else if (kind === 'large') height = (area > 6000 ? 3 : 2) * floorH + roofH;
    else if (kind === 'commercial' || kind === 'retail') height = ((h % 3) === 0 ? 2 : 1) * floorH + 0.8 + roofH;
    else height = 1 * floorH + 0.8 + roofH;
  }
  if (!(minH >= 0)) minH = minLevel > 0 ? minLevel * floorH : 0;
  if (roofH > (height - minH) * 0.6) roofH = (height - minH) * 0.6; // never a roof taller than the walls

  // ---- colours (true colour; the renderer lights them neutrally)
  const wall = parseColour(t['building:colour']) ?? pick(residential ? P.houseWall : P.commWall, h);
  const roofC = parseColour(t['roof:colour']) ?? pick(roof === 'flat' ? P.flatRoof : P.pitchedRoof, h >>> 8);
  return {
    height: +height.toFixed(1), minH: +minH.toFixed(1), roof, roofH: +roofH.toFixed(1),
    across: t['roof:orientation'] === 'across' ? 1 : 0, dir: num(t['roof:direction']),
    wall, roofC, kind, notes,
  };
}
