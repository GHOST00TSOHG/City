#!/usr/bin/env node
// Step 1 of the bake: download raw open data for one area into tools/cache/<area>/ (gitignored).
// Usage: node tools/bake/fetch.mjs <area> [--refresh]
// Sources: OpenStreetMap (Overpass), OpenFreeMap vector tiles (water polygons incl. ocean),
// Overture Maps buildings (via the `overturemaps` CLI, pip install overturemaps), Mapterhorn terrain tiles.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadArea, cacheDir, UA } from './lib.mjs';

const id = process.argv[2]; const refresh = process.argv.includes('--refresh');
if (!id) { console.error('usage: fetch.mjs <area> [--refresh]'); process.exit(1); }
const A = loadArea(id), dir = cacheDir(id), b = A.bbox;
const have = (f) => !refresh && fs.existsSync(path.join(dir, f));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- OSM via Overpass: one polite request, cached. Mirrors tried in order.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const QUERY = `[out:json][timeout:240][bbox:${b.south},${b.west},${b.north},${b.east}];
(
  way["building"]; relation["building"]["type"="multipolygon"];
  way["building:part"]; relation["building:part"]["type"="multipolygon"];
  way["highway"]; way["railway"]; way["aeroway"];
  way["natural"]; relation["natural"]["type"="multipolygon"];
  way["landuse"]; relation["landuse"]["type"="multipolygon"];
  way["leisure"]; way["amenity"="parking"]; way["man_made"~"pier|breakwater|groyne"];
  way["waterway"]; relation["water"];
  node["natural"="tree"]; node["highway"="street_lamp"];
);
out body geom qt;`;
async function fetchOsm() {
  if (have('osm.json')) return console.log('osm: cached');
  for (const url of OVERPASS) {
    try {
      console.log('osm: querying', url);
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(QUERY), signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j.elements?.length) throw new Error('empty');
      fs.writeFileSync(path.join(dir, 'osm.json'), JSON.stringify(j));
      return console.log('osm:', j.elements.length, 'elements, base', j.osm3s?.timestamp_osm_base);
    } catch (e) { console.warn('osm: failed on', url, String(e.message ?? e)); }
  }
  throw new Error('all Overpass mirrors failed');
}

// --- tile helpers
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
export function tileRange(bb, z) { return { z, x0: lon2x(bb.west, z), x1: lon2x(bb.east, z), y0: lat2y(bb.north, z), y1: lat2y(bb.south, z) }; }
async function fetchTiles(label, urlFor, z, ext) {
  const t = tileRange(b, z), sub = path.join(dir, label); fs.mkdirSync(sub, { recursive: true });
  let n = 0;
  for (let x = t.x0; x <= t.x1; x++) for (let y = t.y0; y <= t.y1; y++) {
    const f = path.join(sub, `${z}-${x}-${y}.${ext}`);
    if (!refresh && fs.existsSync(f)) continue;
    const res = await fetch(urlFor(z, x, y), { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${label} ${z}/${x}/${y}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer())); n++; await sleep(150); // polite, serial
  }
  console.log(`${label}: ${(t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1)} tiles (${n} downloaded)`);
}
async function fetchOpenFreeMap() {
  const tj = await (await fetch('https://tiles.openfreemap.org/planet', { headers: { 'User-Agent': UA } })).json();
  const tpl = tj.tiles[0];
  fs.writeFileSync(path.join(dir, 'openfreemap-tilejson.json'), JSON.stringify({ tiles: tj.tiles, attribution: tj.attribution }));
  await fetchTiles('openfreemap', (z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y), A.openfreemapZoom, 'pbf');
}
async function fetchTerrain() {
  await fetchTiles('mapterhorn', (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`, A.terrainZoom, 'webp');
}
function fetchOverture() {
  if (have('overture-buildings.geojson')) return console.log('overture: cached');
  const out = path.join(dir, 'overture-buildings.geojson');
  execFileSync('overturemaps', ['download', `--bbox=${b.west},${b.south},${b.east},${b.north}`, '-f', 'geojson', '--type=building', '-r', A.overtureRelease, '-o', out], { stdio: 'inherit' });
  try { fs.unlinkSync(out + '.state'); } catch {}
  console.log('overture: release', A.overtureRelease);
}

await fetchOsm();
await fetchOpenFreeMap();
await fetchTerrain();
fetchOverture();
fs.writeFileSync(path.join(dir, 'fetched.json'), JSON.stringify({ at: new Date().toISOString() }));
console.log('fetch done ->', path.relative(process.cwd(), dir));
