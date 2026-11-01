// Scout motorcycle mode stills: BROWSER=webkit node tools/shots-scout-moto.mjs [port] → test-results/scout-run-thrust-side.png, scout-run-thrust-back.png (tailpipe flames trail BEHIND)
import { chromium, webkit } from '@playwright/test';
const port = process.argv[2] || '5180', WK = (process.env.BROWSER || 'webkit') === 'webkit';
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] }));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?area=keywest&join=0&fixeddt=${1 / 60}`, { waitUntil: 'load', timeout: 240000 }); await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
await p.evaluate(() => (window.__steps = 1e9)); await p.evaluate(() => window.__robot.setType('scout')); await p.waitForFunction(() => window.__robot.model.type === 'scout');
await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 90; i++) r.ctl.update(1 / 30); }); await p.waitForTimeout(1500); await p.evaluate(() => (window.__steps = 0));
const step = (n) => p.evaluate(async (n) => { for (let i = 0; i < n; i++) { window.__steps = 1; await new Promise((r) => { const t = () => (window.__steps <= 0 ? r() : requestAnimationFrame(t)); t(); }); } }, n);
for (const [name, side] of [['side', Math.PI / 2], ['back', 0]]) {
  await p.evaluate((a) => { const c = window.__robot.ctl; c.camSide = a; c.press('KeyW', true); c.press('ShiftLeft', true); }, side); await step(150);
  await p.screenshot({ path: `test-results/scout-run-thrust-${name}.png`, clip: { x: 340, y: 200, width: 600, height: 460 } });
  await p.evaluate(() => { const c = window.__robot.ctl; c.press('KeyW', false); c.press('ShiftLeft', false); }); await step(120);
}
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
