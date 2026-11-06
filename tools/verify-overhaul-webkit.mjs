#!/usr/bin/env node
// Mac WebKit (Safari engine, Metal GPU) verification of the world overhaul.
//   node tools/verify-overhaul-webkit.mjs            (starts `vite preview` on :4190 unless CITY_URL is set; headed window; HEADLESS=1 for headless)
// Visits newark, each ?town=<slug>, and ?dev=1; records fps, draw calls, console errors and pack coverage; writes .proof/shot-<id>.png and .proof/webkit-report.json.
import { webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname, proof = root + '.proof/';
mkdirSync(proof, { recursive: true });
let server = null, base = process.env.CITY_URL;
if (!base) {
  base = 'http://localhost:4190';
  server = spawn('npx', ['vite', 'preview', '--port', '4190', '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
}
const shots = [{ id: 'newark', q: 'area=newark' }, ...['edo', 'cyber', 'paris', 'harbor', 'airfield', 'outpost'].map((t) => ({ id: t, q: `town=${t}` })), { id: 'dev', q: 'area=newark&dev=1' }];
const browser = await webkit.launch({ headless: process.env.HEADLESS === '1' });
const report = { when: new Date().toISOString(), viewport: '1280x800', browser: 'webkit', shots: [], packsUsed: [], packsRegistered: [] };
const used = new Set();
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 240)));
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
  const t0 = Date.now();
  await page.goto(`${base}/?mp=0&join=0&mode=free&perf=1&${s.q}`);
  await page.waitForFunction(() => window.__city?.ready, null, { timeout: 240_000 });
  await page.waitForTimeout(5000);
  const samples = []; for (let i = 0; i < 6; i++) { samples.push(await page.evaluate(() => ({ fps: window.__city.fps, calls: window.__city.calls, tris: window.__city.triangles }))); await page.waitForTimeout(1000); }
  const info = await page.evaluate(() => ({ backend: window.__city.backend, area: window.__city.area, towns: window.__towns.filter((t) => t.x !== null).map((t) => t.id), packs: window.__packs(), dev: !!document.querySelector('#devpanel') && getComputedStyle(document.querySelector('#devpanel')).display !== 'none' }));
  info.packs.packs.forEach((p) => used.add(p));
  await page.screenshot({ path: `${proof}shot-${s.id}.png` });
  const avg = (k) => samples.reduce((a, b) => a + b[k], 0) / samples.length;
  report.shots.push({ id: s.id, url: s.q, backend: info.backend, area: info.area, townsBuilt: info.towns, fps: +avg('fps').toFixed(1), minFps: +Math.min(...samples.map((x) => x.fps)).toFixed(1), calls: Math.max(...samples.map((x) => x.calls)), tris: Math.round(avg('tris')), devPanelVisible: info.dev, consoleErrors: errors, loadSeconds: +((Date.now() - t0) / 1000).toFixed(1) });
  console.log(report.shots.at(-1));
  await page.close();
}
await browser.close(); server?.kill();
const reg = JSON.parse(readFileSync(root + 'public/tja/used-files.json', 'utf8'));
report.packsRegistered = reg.packs; report.packsUsed = [...used].sort(); report.modelsRegistered = reg.count;
report.ok = report.shots.every((s) => s.calls <= 150 && s.consoleErrors.length === 0) && reg.packs.length === 35 && report.shots.find((s) => s.id === 'dev')?.devPanelVisible === true;
writeFileSync(proof + 'webkit-report.json', JSON.stringify(report, null, 2));
console.log(`packs registered ${reg.packs.length}/35 (${reg.count} models), used at runtime in these shots: ${used.size}; ok=${report.ok}`);
process.exit(report.ok ? 0 : 1);
