// Browser check of the cleaned world: all 5 areas, aerial + street (+ waterfront close-ups), console errors + draw calls per view.
// Usage: node tools/world/shots.mjs [baseUrl]   (default http://localhost:4173, i.e. `npm run build && npm run preview`)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, sampleHeight } from '../../src/area/terrainCore.ts';
import { cleanArea } from '../../src/area/cleanup.ts';
import { planDocks } from '../../src/area/dockPlan.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.argv[2] || 'http://localhost:4173';
const outDir = path.join(root, 'previews/map-cleanup');
fs.mkdirSync(outDir, { recursive: true });
const AREAS = { keywest: ['aerial', 'duval'], bayshore: ['aerial', 'street'], sandyhook: ['aerial', 'street'], newark: ['aerial', 'street'], passaic: ['aerial', 'dock'] };

// close-up targets from the same clean-up the page runs: first dock with boats, first bridge
function targets(id) {
  const dir = path.join(root, 'public/areas', id), area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8'));
  const b = fs.readFileSync(path.join(dir, 'terrain.bin')), g = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const t = { ...g, heightAt: (x, z) => sampleHeight(g, x, z) }, c = cleanArea(area, t), d = planDocks(c.area.piers, t), out = {};
  if (d.boats.length) { const [x, z] = d.boats; out.docks = { pos: [x + 14, 7, z + 14], look: [x, 1, z] }; }
  else if (d.pilings.length) { const [x, z] = d.pilings; out.docks = { pos: [x + 14, 7, z + 14], look: [x, 1, z] }; }
  const br = c.bridges.sort((p, q) => q.len - p.len)[0];
  if (br) { const p = c.plans[br.road], m = p.pts[(br.i0 + br.i1) >> 1]; out.bridge = { pos: [m[0] + 40, 14, m[1] + 40], look: [m[0], 1, m[1]] }; }
  const w = c.walls[Math.floor(c.walls.length / 2)];
  if (w) out.seawall = { pos: [w.x0 - w.nx * 40 + 10, 9, w.z0 - w.nz * 40 + 10], look: [w.x0, 0.5, w.z0] };
  return out;
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const results = { generated: new Date().toISOString(), renderer: 'chromium headless, SwiftShader WebGL2 (fps not representative)', views: [] };
let first = true;
for (const [id, views] of Object.entries(AREAS)) {
  errors = [];
  if (first) { await page.goto(`${base}/?gl=1&join=0&mode=free&area=${id}`); first = false; } else await page.evaluate(([a]) => window.__switchArea(a), [id]);
  await page.waitForFunction((a) => window.__city?.ready && window.__city.area === a, id, { timeout: 240000 });
  const tg = targets(id);
  const list = [...views.map((v) => ({ name: v, set: (p) => p.evaluate((n) => window.__setView(n), v) })), ...Object.entries(tg).map(([k, v]) => ({ name: k, set: (p) => p.evaluate(([a, b]) => window.__setCam(a, b), [v.pos, v.look]) }))];
  for (const v of list) {
    errors = [];
    await v.set(page);
    await page.waitForTimeout(9000);
    const s = await page.evaluate(() => { let y0 = 1e9, y1 = -1e9; window.__cityScene.traverse((o) => { if (o.name === 'sea') { y0 = Math.min(y0, o.position.y); y1 = Math.max(y1, o.position.y); } }); return { calls: window.__city.calls, triangles: window.__city.triangles, seaY: [y0, y1] }; });
    const file = `${id}-${v.name}.png`;
    await page.screenshot({ path: path.join(outDir, file) });
    results.views.push({ area: id, view: v.name, drawCalls: s.calls, triangles: s.triangles, seaLevelY: s.seaY, consoleErrors: errors.length, errors: errors.slice(0, 5), screenshot: `previews/map-cleanup/${file}` });
    console.log(id.padEnd(10), v.name.padEnd(8), 'calls', String(s.calls).padStart(4), 'errors', errors.length, s.seaY.join('/'));
  }
}
results.maxDrawCalls = Math.max(...results.views.map((v) => v.drawCalls));
results.totalConsoleErrors = results.views.reduce((q, v) => q + v.consoleErrors, 0);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1) + '\n');
await browser.close();
console.log('max draw calls', results.maxDrawCalls, 'console errors', results.totalConsoleErrors);
