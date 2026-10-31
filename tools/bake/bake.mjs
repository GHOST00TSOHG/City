#!/usr/bin/env node
// Step 2 of the bake: turn the cached raw data (fetch.mjs) into small runtime files in public/areas/<area>/.
// Usage: node tools/bake/bake.mjs <area>
// Output (deterministic for the same cache):
//   area.json        buildings (footprint + inferred height/roof/colour), roads, pools, piers, trees, lamps
//   terrain.bin      grid header + Int16 heights (dm, water cells < 0) + Uint8 landcover classes
//   attribution.json sources, licences, required credit lines, data dates
//   manifest.json    counts, heuristic stats, file sizes (no private data)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { loadArea, cacheDir, outDir, projector, loadMasks, ringArea, pointInRing, centroid, simplifyRing, q } from './lib.mjs';
import { inferBuilding } from './infer.mjs';

const id = process.argv[2];
if (!id) { console.error('usage: bake.mjs <area>'); process.exit(1); }
const A = loadArea(id), C = cacheDir(id), O = outDir(id), P = projector(A.origin);
const masks = loadMasks(id).map((m) => { const [x, z] = P.fwd(m.lon, m.lat); return { x, z, r: m.radiusM }; });
const masked = (x, z) => masks.some((m) => (x - m.x) ** 2 + (z - m.z) ** 2 < m.r * m.r);
const osm = JSON.parse(fs.readFileSync(path.join(C, 'osm.json'), 'utf8'));
const palette = A.palette ?? id;

// ---------- geometry helpers
const projLine = (geom) => { const o = []; for (const g of geom) { const [x, z] = P.fwd(g.lon, g.lat); o.push(x, z); } return o; };
const closeOpen = (r) => (r.length > 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1] ? r.slice(0, -2) : r);
const ccw = (r) => (ringArea(r) < 0 ? r : reverse(r)); // x east, z south: negative signed area = CCW seen from above (+y)
const cw = (r) => (ringArea(r) > 0 ? r : reverse(r));
function reverse(r) { const o = []; for (let i = r.length - 2; i >= 0; i -= 2) o.push(r[i], r[i + 1]); return o; }
function assembleRings(ways) { // join member ways end-to-end into closed rings
  const segs = ways.map((w) => w.slice()), rings = [];
  while (segs.length) {
    let cur = segs.shift();
    for (let guard = 0; guard < 1000; guard++) {
      const sx = cur[0], sz = cur[1], ex = cur[cur.length - 2], ez = cur[cur.length - 1];
      if (Math.hypot(sx - ex, sz - ez) < 0.01 && cur.length > 6) break;
      const i = segs.findIndex((s) => (Math.hypot(s[0] - ex, s[1] - ez) < 0.01) || (Math.hypot(s[s.length - 2] - ex, s[s.length - 1] - ez) < 0.01));
      if (i < 0) break;
      let s = segs.splice(i, 1)[0]; if (Math.hypot(s[0] - ex, s[1] - ez) >= 0.01) s = reverse(s);
      cur = cur.concat(s.slice(2));
    }
    if (cur.length >= 8) rings.push(closeOpen(cur));
  }
  return rings;
}
/** Polygons of an element: [{outer, holes[]}] (ways closed, or multipolygon relations). */
function polygonsOf(e) {
  if (e.type === 'way') { if (!e.geometry || e.geometry.length < 4) return []; const r = closeOpen(projLine(e.geometry)); return r.length >= 6 ? [{ outer: r, holes: [] }] : []; }
  if (e.type === 'relation') {
    const outer = assembleRings(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => projLine(m.geometry)));
    const inner = assembleRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => projLine(m.geometry)));
    return outer.map((o) => ({ outer: o, holes: inner.filter((h) => pointInRing(h[0], h[1], o)) }));
  }
  return [];
}
function obb(r) { // minimum-area oriented bounding box over edge directions
  let best = null; const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = r[2 * j] - r[2 * i], dz = r[2 * j + 1] - r[2 * i + 1], L = Math.hypot(dx, dz); if (L < 0.3) continue;
    const ux = dx / L, uz = dz / L; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (let k = 0; k < n; k++) { const a = r[2 * k] * ux + r[2 * k + 1] * uz, b = -r[2 * k] * uz + r[2 * k + 1] * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) { const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2; best = { area, ang: Math.atan2(uz, ux), la: a1 - a0, lb: b1 - b0, cx: ca * ux - cb * uz, cz: ca * uz + cb * ux }; }
  }
  if (!best) return null;
  // normalise: angle points along the long side
  if (best.lb > best.la) { best.ang += Math.PI / 2; [best.la, best.lb] = [best.lb, best.la]; }
  return { cx: best.cx, cz: best.cz, ang: Math.atan2(Math.sin(best.ang), Math.cos(best.ang)), long: best.la, short: best.lb, area: best.area };
}

// ---------- grid (terrain + landcover)
const corners = [[A.bbox.west, A.bbox.south], [A.bbox.east, A.bbox.north], [A.bbox.west, A.bbox.north], [A.bbox.east, A.bbox.south]].map(([lo, la]) => P.fwd(lo, la));
const gx0 = Math.floor(Math.min(...corners.map((c) => c[0]))), gz0 = Math.floor(Math.min(...corners.map((c) => c[1])));
const gx1 = Math.ceil(Math.max(...corners.map((c) => c[0]))), gz1 = Math.ceil(Math.max(...corners.map((c) => c[1])));
const G = A.gridM, NX = Math.floor((gx1 - gx0) / G) + 1, NZ = Math.floor((gz1 - gz0) / G) + 1;
const water = new Uint8Array(NX * NZ), cover = new Uint8Array(NX * NZ), elev = new Float32Array(NX * NZ);
const LC = { land: 0, grass: 1, sand: 2, paved: 3, wood: 4, wetland: 5, pitch: 6 };
function fillPoly(rings, grid, val) { // even-odd scanline over cell centres
  for (let iz = 0; iz < NZ; iz++) {
    const z = gz0 + iz * G, xs = [];
    for (const r of rings) for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
      const zi = r[2 * i + 1], zj = r[2 * j + 1]; if ((zi > z) !== (zj > z)) xs.push(r[2 * i] + ((z - zi) / (zj - zi)) * (r[2 * j] - r[2 * i]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil((xs[k] - gx0) / G)), b = Math.min(NX - 1, Math.floor((xs[k + 1] - gx0) / G));
      for (let ix = a; ix <= b; ix++) grid[iz * NX + ix] = val;
    }
  }
}

// Water: OpenFreeMap (OpenMapTiles schema) water layer incl. ocean polygons; pools are kept separate (too small for the grid).
let waterPolys = 0;
for (const f of fs.readdirSync(path.join(C, 'openfreemap')).sort()) {
  const [z, x, y] = f.replace('.pbf', '').split('-').map(Number);
  let buf = fs.readFileSync(path.join(C, 'openfreemap', f)); if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf);
  const vt = new VectorTile(new Pbf(buf)), L = vt.layers.water; if (!L) continue;
  for (let i = 0; i < L.length; i++) {
    const ft = L.feature(i); if (ft.properties.class === 'swimming_pool') continue;
    const gj = ft.toGeoJSON(x, y, z), polys = gj.geometry.type === 'Polygon' ? [gj.geometry.coordinates] : gj.geometry.type === 'MultiPolygon' ? gj.geometry.coordinates : [];
    for (const poly of polys) { fillPoly(poly.map((ring) => ring.flatMap(([lo, la]) => P.fwd(lo, la))), water, 1); waterPolys++; }
  }
}
// OSM landcover (order = priority, later wins)
const coverRules = [
  [(t) => ['residential', 'retail', 'commercial', 'military', 'industrial', 'garages'].includes(t.landuse), null],
  [(t) => ['grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery'].includes(t.landuse) || ['park', 'garden', 'golf_course', 'dog_park', 'nature_reserve'].includes(t.leisure) || ['grassland', 'heath'].includes(t.natural), LC.grass],
  [(t) => t.landuse === 'forest' || ['wood', 'scrub'].includes(t.natural), LC.wood],
  [(t) => t.natural === 'wetland', LC.wetland],
  [(t) => ['pitch', 'playground', 'court_area'].includes(t.leisure), LC.pitch],
  [(t) => ['beach', 'sand', 'bare_rock'].includes(t.natural) || t.leisure === 'beach_resort', LC.sand],
  [(t) => t.amenity === 'parking' || (t.highway && t.area === 'yes') || t.aeroway === 'apron', LC.paved],
];
for (const [test, val] of coverRules) {
  if (val == null) continue;
  for (const e of osm.elements) { const t = e.tags; if (!t || t.building || !test(t)) continue; for (const p of polygonsOf(e)) fillPoly([p.outer, ...p.holes], cover, val); }
}
for (const e of osm.elements) { const t = e.tags; if (t && (t.natural === 'water' || t.water) && !t.building) for (const p of polygonsOf(e)) fillPoly([p.outer, ...p.holes], water, 1); }

// Terrain: Mapterhorn terrarium webp tiles (512 px), bilinear.
const tiles = new Map();
for (const f of fs.readdirSync(path.join(C, 'mapterhorn')).sort()) {
  const { data, info } = await sharp(path.join(C, 'mapterhorn', f)).raw().toBuffer({ resolveWithObject: true });
  tiles.set(f.replace('.webp', ''), { data, ch: info.channels, size: info.width });
}
const TZ = A.terrainZoom;
function elevAt(lon, lat) {
  const n = 2 ** TZ, X = ((lon + 180) / 360) * n, r = (lat * Math.PI) / 180, Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(X), ty = Math.floor(Y), t = tiles.get(`${TZ}-${tx}-${ty}`); if (!t) return 0;
  const px = (X - tx) * t.size - 0.5, py = (Y - ty) * t.size - 0.5;
  const s = (ix, iy) => { ix = Math.max(0, Math.min(t.size - 1, ix)); iy = Math.max(0, Math.min(t.size - 1, iy)); const o = (iy * t.size + ix) * t.ch; return t.data[o] * 256 + t.data[o + 1] + t.data[o + 2] / 256 - 32768; };
  const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
  return (s(x0, y0) * (1 - fx) + s(x0 + 1, y0) * fx) * (1 - fy) + (s(x0, y0 + 1) * (1 - fx) + s(x0 + 1, y0 + 1) * fx) * fy;
}
for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) { const [lo, la] = P.inv(gx0 + ix * G, gz0 + iz * G); elev[iz * NX + ix] = elevAt(lo, la); }
// Land never below +0.4 m, water cells at -2.5 m so the shoreline is the interpolated 0 m contour on the sea plane.
// Coast cells: water cells next to land get -0.8 m for a gentle shelf.
const hgt = new Int16Array(NX * NZ);
for (let i = 0; i < NX * NZ; i++) hgt[i] = water[i] ? -25 : Math.round(Math.max(0.4, Math.min(elev[i], 300)) * 10);
for (let iz = 1; iz < NZ - 1; iz++) for (let ix = 1; ix < NX - 1; ix++) { const i = iz * NX + ix; if (water[i] && (!water[i - 1] || !water[i + 1] || !water[i - NX] || !water[i + NX])) hgt[i] = -8; }

// ---------- buildings
const stats = { osm: 0, overture: 0, parts: 0, skippedOutlineWithParts: 0, masked: 0, notes: {}, roofs: {} };
const ovr = JSON.parse(fs.readFileSync(path.join(C, 'overture-buildings.geojson'), 'utf8')).features;
const ovrEst = new Map(); // OSM way id -> Overture height estimate (Microsoft ML conflation)
for (const f of ovr) for (const s of f.properties.sources ?? []) if (s.dataset === 'OpenStreetMap' && s.record_id) ovrEst.set(s.record_id.split('@')[0], { height: f.properties.height, floors: f.properties.num_floors });

const raw = []; // {id, tags, poly, src}
for (const e of osm.elements) {
  const t = e.tags; if (!t || (!t.building && !t['building:part'])) continue;
  if (t.building && ['no', 'construction', 'demolished', 'ruins'].includes(t.building)) continue;
  if (t.location === 'underground' || Number(t.layer) < 0) continue;
  for (const p of polygonsOf(e)) raw.push({ id: `${e.type[0]}${e.id}`, tags: t, poly: p, part: !!t['building:part'], src: 'osm' });
}
// Outlines that contain building:part centroids are replaced by their parts.
const parts = raw.filter((b) => b.part), partCs = parts.map((b) => centroid(b.poly.outer));
const outlines = raw.filter((b) => !b.part && !(partCs.some(([x, z]) => pointInRing(x, z, b.poly.outer)) && (stats.skippedOutlineWithParts++, true)));
const all = [...outlines, ...parts];
// Spatial hash of OSM footprints to drop Overture duplicates.
const cell = 20, hashGrid = new Map(), key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
for (const b of outlines) { const k = key(...centroid(b.poly.outer)); (hashGrid.get(k) ?? hashGrid.set(k, []).get(k)).push(b.poly.outer); }
const coveredByOsm = (x, z) => { const cx = Math.floor(x / cell), cz = Math.floor(z / cell); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const r of hashGrid.get(`${cx + i},${cz + j}`) ?? []) if (pointInRing(x, z, r)) return true; return false; };
for (const f of ovr) {
  const p = f.properties; if ((p.sources ?? []).some((s) => s.dataset === 'OpenStreetMap')) continue;
  if (p.is_underground) continue;
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) {
    const rings = poly.map((r) => closeOpen(r.flatMap(([lo, la]) => P.fwd(lo, la))));
    const [cx, cz] = centroid(rings[0]); if (coveredByOsm(cx, cz)) continue;
    all.push({ id: `o${p.id}`, tags: { building: p.subtype === 'residential' ? 'house' : p.class ?? 'yes', ...(p.roof_shape ? { 'roof:shape': p.roof_shape } : {}) }, poly: { outer: rings[0], holes: rings.slice(1) }, src: 'overture', est: { height: p.height, floors: p.num_floors } });
  }
}
const buildings = [];
for (const b of all) {
  const outer = cw(simplifyRing(b.poly.outer, 0.15)), holes = b.poly.holes.map((h) => ccw(simplifyRing(h, 0.15)));
  const area = Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
  if (area < 4) continue;
  const [cx, cz] = centroid(outer);
  if (masked(cx, cz)) { stats.masked++; continue; }
  const box = obb(outer); if (!box) continue;
  const inf = inferBuilding(b.tags, area, box, b.id, b.est ?? ovrEst.get(b.id), palette);
  // Pitched roofs need a near-rectangular footprint; otherwise fall back to a clean flat roof with a low parapet.
  const fill = area / box.area;
  let roof = inf.roof;
  if (roof !== 'flat' && roof !== 'dome' && (fill < 0.8 || holes.length)) { roof = 'flat'; inf.notes.push('roof:flat-fallback'); }
  if (roof === 'flat') inf.roofH = 0;
  stats[b.src]++; if (b.part) stats.parts++;
  for (const n of inf.notes) stats.notes[n] = (stats.notes[n] ?? 0) + 1;
  stats.roofs[roof] = (stats.roofs[roof] ?? 0) + 1;
  buildings.push({
    r: [outer.map(q), ...holes.map((h) => h.map(q))],
    h: inf.height, m: inf.minH, s: roof, rh: inf.roofH,
    o: [q(box.cx), q(box.cz), Math.round((inf.across ? box.ang + Math.PI / 2 : box.ang) * 1000), q(box.long), q(box.short)],
    wc: inf.wall, rc: inf.roofC, ...(b.src === 'overture' ? { src: 1 } : {}),
  });
}
buildings.sort((a, b) => a.r[0][0] - b.r[0][0] || a.r[0][1] - b.r[0][1]);

// ---------- roads, pools, piers, trees, lamps
const ROAD = { motorway: [0, 14], trunk: [0, 12], primary: [0, 11], secondary: [0, 10], tertiary: [0, 8.5], primary_link: [0, 7], secondary_link: [0, 7], tertiary_link: [0, 6], residential: [1, 6.5], unclassified: [1, 6], living_street: [1, 5], road: [1, 6], service: [2, 4], track: [2, 3], pedestrian: [3, 4.5], footway: [3, 1.8], path: [3, 1.5], cycleway: [3, 1.8], steps: [3, 1.8], bridleway: [3, 2] };
const roads = [];
for (const e of osm.elements) {
  const t = e.tags; if (e.type !== 'way' || !t?.highway || !e.geometry || t.area === 'yes' || t.tunnel === 'yes' || t.tunnel === 'building_passage') continue;
  const R = ROAD[t.highway]; if (!R) continue;
  let w = parseFloat(t.width); if (!(w > 0)) w = Number(t.lanes) > 0 && R[0] < 2 ? Number(t.lanes) * 3.3 : R[1];
  if (t.service === 'driveway') w = 3; if (t.service === 'parking_aisle') w = 5; if (t.footway === 'sidewalk' || t.footway === 'crossing') w = 1.6;
  const line = projLine(e.geometry);
  roads.push({ c: R[0], w: +w.toFixed(1), p: line.map(q), ...(t.bridge === 'yes' ? { b: 1 } : {}), ...(Number(t.layer) > 0 ? { l: Number(t.layer) } : {}) });
}
const pools = [], piers = [], trees = [], lamps = [];
for (const e of osm.elements) {
  const t = e.tags; if (!t) continue;
  if (t.leisure === 'swimming_pool' && e.type === 'way') for (const p of polygonsOf(e)) { const [cx, cz] = centroid(p.outer); if (!masked(cx, cz) && Math.abs(ringArea(p.outer)) > 3) pools.push(cw(p.outer).map(q)); }
  if (['pier', 'breakwater', 'groyne'].includes(t.man_made) && e.type === 'way' && e.geometry) {
    const line = projLine(e.geometry), closed = e.geometry.length > 3 && e.geometry[0].lat === e.geometry.at(-1).lat && e.geometry[0].lon === e.geometry.at(-1).lon;
    if (closed && t.area !== 'no') piers.push({ poly: cw(closeOpen(line)).map(q) }); else piers.push({ line: line.map(q), w: parseFloat(t.width) > 0 ? parseFloat(t.width) : 3 });
  }
  if (e.type === 'node' && t.natural === 'tree') { const [x, z] = P.fwd(e.lon, e.lat); if (!masked(x, z)) trees.push([q(x), q(z)]); }
  if (e.type === 'node' && t.highway === 'street_lamp') { const [x, z] = P.fwd(e.lon, e.lat); lamps.push([q(x), q(z)]); }
}

// ---------- write
const area = { v: 1, id, name: A.name, origin: A.origin.name, units: 'dm (x east, z south, local ENU around origin)', buildings, roads, pools, piers, trees, lamps };
fs.writeFileSync(path.join(O, 'area.json'), JSON.stringify(area));
const head = new Int32Array([0x43545231 /* CTR1 */, NX, NZ, G * 100, gx0 * 100, gz0 * 100]);
fs.writeFileSync(path.join(O, 'terrain.bin'), Buffer.concat([Buffer.from(head.buffer), Buffer.from(hgt.buffer), Buffer.from(cover.buffer)]));
const ofm = JSON.parse(fs.readFileSync(path.join(C, 'openfreemap-tilejson.json'), 'utf8'));
const attribution = {
  area: A.name,
  credits: [
    { text: '© OpenStreetMap contributors', licence: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright', used: 'buildings, building parts, roads, landcover, pools, piers, trees, lamps' },
    { text: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap', licence: 'OpenMapTiles schema; data ODbL', url: 'https://openfreemap.org', used: 'water + ocean polygons', tiles: ofm.tiles?.[0] },
    { text: '© Overture Maps Foundation', licence: 'ODbL 1.0 (buildings theme)', url: 'https://docs.overturemaps.org/attribution/', used: 'gap-fill footprints (Microsoft ML Buildings) and height estimates', release: A.overtureRelease },
    { text: '© Mapterhorn', licence: 'open data, see attribution list (USGS 3DEP for the USA)', url: 'https://mapterhorn.com/attribution', used: `terrain, zoom ${A.terrainZoom}` },
  ],
  osmTimestamp: osm.osm3s?.timestamp_osm_base ?? null,
  note: 'This baked data is a Derived Database of OpenStreetMap and is available under the ODbL 1.0.',
};
fs.writeFileSync(path.join(O, 'attribution.json'), JSON.stringify(attribution, null, 2) + '\n');
const sizes = Object.fromEntries(['area.json', 'terrain.bin'].map((f) => { const b = fs.readFileSync(path.join(O, f)); return [f, { bytes: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length }]; }));
const manifest = { area: id, grid: { nx: NX, nz: NZ, m: G }, waterPolys, counts: { buildings: buildings.length, roads: roads.length, pools: pools.length, piers: piers.length, trees: trees.length, lamps: lamps.length }, buildingSources: { osm: stats.osm, overture: stats.overture, parts: stats.parts, outlinesReplacedByParts: stats.skippedOutlineWithParts }, masks: masks.length ? `${masks.length} private mask(s) applied, ${stats.masked} buildings removed` : 'none', heightSource: stats.notes, roofs: stats.roofs, sizes };
fs.writeFileSync(path.join(O, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 1));
