// Round-3 close-ups: steep-lot foundations (newark, passaic; cameras frozen in r3-cameras.json) and a bridge underside.
// Usage: node tools/world/shots-r3.mjs <before|after> [baseUrl]   (needs `npm run build && npm run preview`)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, sampleHeight } from '../../src/area/terrainCore.ts';
import { cleanArea } from '../../src/area/cleanup.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tag = process.argv[2] || 'after', base = process.argv[3] || 'http://localhost:4173', only = process.argv[4] ? new RegExp(process.argv[4]) : null;
const outDir = path.join(root, 'previews/map-cleanup'), cams = JSON.parse(fs.readFileSync(path.join(outDir, 'r3-cameras.json'), 'utf8'));
// bridge underside: first long bridge of keywest (camera under the span looking up at the soffit); fixed from the bake, same for before / after
function underside() {
  const dir = path.join(root, 'public/areas/keywest'), area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8'));
  const b = fs.readFileSync(path.join(dir, 'terrain.bin')), g = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), t = { ...g, heightAt: (x, z) => sampleHeight(g, x, z) }, c = cleanArea(area, t);
  const br = c.bridges.filter((q) => q.bents.length >= 3).sort((p, q) => q.len - p.len)[0], p = c.plans[br.road], k = br.bents.length >> 1, A = br.bents[k - 1], B = br.bents[k];
  const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / l, uz = (B[1] - A[1]) / l;
  let bi = br.i0, d = Infinity; for (let i = br.i0; i <= br.i1; i++) { const dd = Math.hypot(p.pts[i][0] - mx, p.pts[i][1] - mz); if (dd < d) { d = dd; bi = i; } }
  const gy = Math.max(t.heightAt(mx, mz), 0), deck = p.y[bi];
  return { pos: [mx - ux * 9, gy + 1.7, mz - uz * 9], look: [mx + ux * 6, deck - 0.8, mz + uz * 6] };
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(e.message));
// the new grading can raise ground under a frozen "before" camera: in the after run keep the camera 4 m over the *current* ground
const cleanedGround = {};
function lift(id, c) {
  if (tag === 'before' || !c.exposed) return c;
  if (!cleanedGround[id]) { const dir = path.join(root, 'public/areas', id), area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8')), b = fs.readFileSync(path.join(dir, 'terrain.bin')), g = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), t = { ...g, heightAt: (x, z) => sampleHeight(g, x, z) }; cleanArea(area, t); cleanedGround[id] = t; }
  let m = 0; for (let k = 0; k <= 10; k++) { const u = k / 10; m = Math.max(m, cleanedGround[id].heightAt(c.pos[0] + (c.look[0] - c.pos[0]) * u, c.pos[2] + (c.look[2] - c.pos[2]) * u)); }
  const y = Math.max(c.pos[1], m + 3); return { ...c, pos: [c.pos[0], y, c.pos[2]] };
}
const jobs = [['keywest', 'bridge-under', underside()], ...Object.entries(cams).flatMap(([id, l]) => l.map((c, i) => [id, `steep${i + 1}`, lift(id, c)]))].filter((j) => !only || only.test(`${j[0]}-${j[1]}`)).sort((a, b) => a[0].localeCompare(b[0]));
let cur = null;
for (const [id, name, c] of jobs) {
  if (cur === null) await page.goto(`${base}/?gl=1&join=0&mode=free&area=${id}`); else if (cur !== id) await page.evaluate((a) => window.__switchArea(a), id);
  const sw = cur !== id; cur = id; await page.waitForFunction((a) => window.__city?.ready && window.__city.area === a, id, { timeout: 240000 });
  if (sw) await page.waitForTimeout(10000); // let the area switch finish fading in
  await page.evaluate(([a, b]) => window.__setCam(a, b), [c.pos, c.look]); await page.waitForTimeout(8000);
  const f = `r3-${tag}-${id}-${name}.png`; await page.screenshot({ path: path.join(outDir, f) }); console.log(f, c.exposed ?? '');
}
console.log('console errors', errors.length, errors.slice(0, 3)); await browser.close();
