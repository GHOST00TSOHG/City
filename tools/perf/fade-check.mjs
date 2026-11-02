// LOD cross-fade check (run F, item 4): fly the free camera across the near/far-detail altitude threshold over Newark in real WebKit, record the far-mesh share per frame
// (should ramp 0 -> 1 over ~0.4 s), the draw calls during the fade, and screenshot the moment mid-fade.
//   node tools/perf/fade-check.mjs <outdir> [port]
import os from 'node:os';
import fs from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [outDir, port = '5190'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`http://localhost:${port}/?join=0&area=newark`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.waitForTimeout(3000);
await p.keyboard.press('KeyV'); await p.waitForTimeout(800);
const cam = (y) => p.evaluate((y) => { const c = window.__cityCam; c.position.set(-300, y, -17900); c.lookAt(-300, 0, -17000); window.__cityControls.syncAngles(); }, y);
await cam(300); await p.waitForTimeout(4000);
await p.screenshot({ type: 'jpeg', quality: 82, path: `${outDir}/item4-fade-near-300m.jpg` });
const rec = (ms) => p.evaluate((ms) => new Promise((res) => {
  const out = [], r = window.__renderer.info.render, t0 = performance.now();
  const tick = (t) => { const w = window.__world(); out.push([+(t - t0).toFixed(0), +(w.tiles.find((x) => x.id === 'newark')?.fade ?? -1).toFixed(2), r.drawCalls ?? r.calls]); if (t - t0 < ms) requestAnimationFrame(tick); else res(out); };
  requestAnimationFrame(tick);
}), ms);
await cam(560);
const up = await rec(1200);
await p.waitForTimeout(1500);
await p.screenshot({ type: 'jpeg', quality: 82, path: `${outDir}/item4-fade-far-560m.jpg` });
await cam(300);
const down = rec(1200); await p.waitForTimeout(250);
await p.screenshot({ type: 'jpeg', quality: 82, path: `${outDir}/item4-fade-mid-down.jpg` });
const dn = await down;
const summ = (a) => ({ frames: a.length, fadeFirst: a[0], fadeLast: a[a.length - 1], rampMs: (() => { const s = a.find((x) => x[1] > 0 && x[1] < 1), e = a.findLast((x) => x[1] > 0 && x[1] < 1); return s && e ? e[0] - s[0] : 0; })(), callsMax: Math.max(...a.map((x) => x[2])) });
console.log('up', JSON.stringify(summ(up)), 'down', JSON.stringify(summ(dn)));
console.log('trace up', JSON.stringify(up.filter((_, i) => i % 3 === 0).slice(0, 14)));
console.log('errors', errors.length, errors.slice(0, 3));
await b.close();
