#!/usr/bin/env node
// Mac WebKit (Safari engine, Metal GPU) verification of the world overhaul.
//   node tools/verify-overhaul-webkit.mjs            (starts `vite preview` on :4191 unless CITY_URL is set; headed window; HEADLESS=1 for headless)
// 13 street-level shots (eye 2.2-4.0 m, curbed street / town square): newark downtown skyline, a street in each of the 5 areas, the 6 towns, and the dev panel.
// Records fps, draw calls, console errors, placement-audit violations and pack coverage; writes .proof/shot-<id>.png and .proof/webkit-report.json.
import { webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname, proof = root + '.proof/';
mkdirSync(proof, { recursive: true });
let server = null, base = process.env.CITY_URL;
if (!base) {
  base = 'http://localhost:4191';
  server = spawn('npx', ['vite', 'preview', '--port', '4191', '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
}
const shots = [{ id: 'newark-downtown', q: 'area=newark&view=downtown' }, ...['newark', 'passaic', 'bayshore', 'sandyhook', 'keywest'].map((a) => ({ id: `${a}-street`, q: `area=${a}`, street: a })),
  ...['edo', 'cyber', 'paris', 'harbor', 'airfield', 'outpost'].map((t) => ({ id: t, q: `town=${t}`, town: t })), { id: 'dev', q: 'area=newark&dev=1' }];
/** Runs in the page: stands on a straight run of a major street (lane side, eye 2.8 m) and looks down it. */
const placeOnStreet = () => {
  const inp = window.__app.auditInput(), roads = inp.area.roads, ctr = (window.__app.views.find((v) => v.name === 'street') ?? window.__app.views[0]), cx = ctr.look[0], cz = ctr.look[2];
  let best = null;
  for (const r of roads) {
    if (r.c > 1 || r.w < 7) continue;
    const p = []; for (let i = 0; i + 1 < r.p.length; i += 2) p.push([r.p[i] / 10, r.p[i + 1] / 10]);
    for (let i = 0; i + 1 < p.length; i++) {
      // a run: follow points while the heading stays within 12 degrees
      const h0 = Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]); let L = 0, j = i;
      while (j + 1 < p.length) { const h = Math.atan2(p[j + 1][1] - p[j][1], p[j + 1][0] - p[j][0]); if (Math.abs(Math.atan2(Math.sin(h - h0), Math.cos(h - h0))) > 0.21) break; L += Math.hypot(p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]); j++; }
      if (L < 70) continue;
      const d = Math.hypot(p[i][0] - cx, p[i][1] - cz) - L * 0.3 - r.w * 4; // near the area's street view, long and wide
      if (!best || d < best.d) best = { d, x: p[i][0], z: p[i][1], h: h0, w: r.w, L };
    }
  }
  if (!best) return null;
  const nx = -Math.sin(best.h), nz = Math.cos(best.h), x = best.x + Math.cos(best.h) * 12 + nx * best.w * 0.25, z = best.z + Math.sin(best.h) * 12 + nz * best.w * 0.25;
  const y = window.__ground(x, z).floor.y + 2.8, cam = window.__cityCam;
  cam.position.set(x, y, z); cam.lookAt(x + Math.cos(best.h) * 60, y - 0.5, z + Math.sin(best.h) * 60); window.__cityControls.syncAngles(); window.__cityControls.setWalk(true);
  return { x: +x.toFixed(1), z: +z.toFixed(1), heading: +best.h.toFixed(2), roadW: best.w, runLen: +best.L.toFixed(0), eye: 2.8 };
};
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
  let street = null; if (s.street) { street = await page.evaluate(placeOnStreet); await page.waitForTimeout(1500); }
  await page.waitForTimeout(5000);
  const early = await page.evaluate(() => window.__city.fps); // load-time window: neighbour areas are still preloading here
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 20000));
  const samples = []; for (let i = 0; i < 6; i++) { samples.push(await page.evaluate(() => ({ fps: window.__city.fps, calls: window.__city.calls, tris: window.__city.triangles }))); await page.waitForTimeout(1000); }
  const audit = await page.evaluate((t) => { const a = window.__auditPlacements(t ?? undefined); return { counts: a.counts, violations: a.violations.slice(0, 20), total: a.violations.length }; }, s.town ?? null);
  const info = await page.evaluate(() => ({ backend: window.__city.backend, area: window.__city.area, towns: window.__towns.filter((t) => t.x !== null).map((t) => t.id), packs: window.__packs(), dev: !!document.querySelector('#devpanel') && getComputedStyle(document.querySelector('#devpanel')).display !== 'none' }));
  info.packs.packs.forEach((p) => used.add(p));
  await page.screenshot({ path: `${proof}shot-${s.id}.png` });
  const avg = (k) => samples.reduce((a, b) => a + b[k], 0) / samples.length;
  report.shots.push({ id: s.id, url: s.q, backend: info.backend, area: info.area, townsBuilt: info.towns, fps: +avg('fps').toFixed(1), earlyFps: +early.toFixed(1), minFps: +Math.min(...samples.map((x) => x.fps)).toFixed(1), calls: Math.max(...samples.map((x) => x.calls)), tris: Math.round(avg('tris')), devPanelVisible: info.dev, street, placement: audit, consoleErrors: errors, loadSeconds: +((Date.now() - t0) / 1000).toFixed(1) });
  console.log(report.shots.at(-1));
  await page.close();
}
await browser.close(); server?.kill();
const reg = JSON.parse(readFileSync(root + 'public/tja/used-files.json', 'utf8'));
report.packsRegistered = reg.packs; report.packsUsed = [...used].sort(); report.modelsRegistered = reg.count;
report.ok = report.shots.every((s) => s.calls <= 150 && s.consoleErrors.length === 0 && s.placement.total === 0 && s.minFps >= 55) && reg.packs.length === 35 && report.shots.find((s) => s.id === 'dev')?.devPanelVisible === true;
writeFileSync(proof + 'webkit-report.json', JSON.stringify(report, null, 2));
console.log(`packs registered ${reg.packs.length}/35 (${reg.count} models), used at runtime in these shots: ${used.size}; ok=${report.ok}`);
process.exit(report.ok ? 0 : 1);
