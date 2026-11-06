#!/usr/bin/env node
// Scans the code for every pack model it can load from public/tja/ and writes public/tja/used-files.json (the ship list).
// The production build prunes dist/tja to exactly these files (vite.config.ts). Run after changing towns or pack content:  node tools/stage-used-tja.mjs
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname, tja = join(root, 'public/tja');
const manifest = JSON.parse(readFileSync(join(tja, 'manifest.json'), 'utf8'));
const have = new Map(); // "pack/file.glb" -> bytes
for (const [pack, p] of Object.entries(manifest.packs)) for (const i of p.items) have.set(`${pack}/${i.f}`, i.b);

const files = new Set(), missing = new Set();
const add = (pack, name) => { const f = `${pack}/${name.endsWith('.glb') ? name : name + '.glb'}`; (have.has(f) ? files : missing).add(f); };
for (const src of readdirSync(join(root, 'src/area')).filter((f) => /^(townDefs|packCity|packTowns|packLibrary)\.ts$/.test(f))) {
  const text = readFileSync(join(root, 'src/area', src), 'utf8');
  const fn = {}; for (const m of text.matchAll(/\b(\w+) = mk\('([\w-]+)'\)/g)) fn[m[1]] = m[2];                        // const edo = mk('edo-village')
  for (const m of text.matchAll(/\b(\w+)\('([\w]+)'\)/g)) if (fn[m[1]]) add(fn[m[1]], m[2]);                          // edo('great_torii')
  for (const m of text.matchAll(/\brc\('([\w]+)'\)/g)) add('realistic-city', m[1]);                                    // rc('realistic_bench_01')
  for (const m of text.matchAll(/'([a-z-]+)\/([\w]+)\.glb'/g)) add(m[1], m[2]);                                        // literal paths
  for (const m of text.matchAll(/room\((\w+),([^;]*?)\)\);/gs)) if (fn[m[1]]) for (const s of m[2].matchAll(/'([\w]+)'/g)) { if (have.has(`${fn[m[1]]}/${s[1]}.glb`)) add(fn[m[1]], s[1]); } // room kits
}
const list = [...files].sort(), bytes = list.reduce((a, f) => a + have.get(f), 0);
const packs = new Set(list.map((f) => f.split('/')[0])), all = Object.keys(manifest.packs);
const out = { generated: 'tools/stage-used-tja.mjs', count: list.length, bytes, packs: [...packs].sort(), files: list };
writeFileSync(join(tja, 'used-files.json'), JSON.stringify(out, null, 1) + '\n');
for (const f of list) if (!existsSync(join(tja, f)) || statSync(join(tja, f)).size === 0) console.warn('not on disk:', f);
console.log(`${list.length} models, ${(bytes / 1e6).toFixed(1)} MB, ${packs.size}/${all.length} packs`);
if (missing.size) console.warn('referenced but not in manifest:', [...missing]);
const absent = all.filter((p) => !packs.has(p)); if (absent.length) { console.error('packs with no placed model:', absent); process.exitCode = 1; }
