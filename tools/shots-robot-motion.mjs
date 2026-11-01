// Run + landing shots, fps and draw calls: BROWSER=webkit node tools/shots-robot-motion.mjs [port=5180] [types] [modes=run,land]
//   run  → test-results/run-<type>.png   (Shift+W on the street, shot at full speed) + stats
//   land → test-results/land-<type>.png  (dropped from 30 m, shot ~0.3 s into the landing) + stats
import { chromium, webkit } from '@playwright/test';
const port = process.argv[2] || '5180', TYPES = (process.argv[3] || 'scout,heavy,worker,glitch').split(','), MODES = (process.argv[4] || 'run,land').split(','), WK = (process.env.BROWSER || 'webkit') === 'webkit';
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] }));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('response', (r) => r.status() >= 400 && errs.push(r.status() + ' ' + r.url()));
await p.goto(`http://localhost:${port}/?area=keywest&join=0`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
const press = (c, d) => p.evaluate(([c, d]) => window.__robot.ctl.press(c, d), [c, d]);
const stat = () => p.evaluate(() => ({ fps: window.__city.fps, calls: window.__city.calls, c: window.__robot.ctl }) ).then(() => p.evaluate(() => ({ fps: +window.__city.fps.toFixed(1), calls: window.__city.calls })));
const out = {};
for (const t of TYPES) {
  await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  out[t] = {};
  if (MODES.includes('run')) {
    await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); }); await p.waitForTimeout(2500);
    await press('KeyW', true); await press('ShiftLeft', true); await p.waitForTimeout(2600);
    const info = await p.evaluate(() => { const c = window.__robot.ctl; return { anim: c.anim, mph: +(Math.hypot(c.vel.x, c.vel.z)).toFixed(1), ball: +c.ball.toFixed(2), gallop: +c.gallop.toFixed(2) }; });
    await p.screenshot({ path: `test-results/run-${t}.png`, clip: { x: 240, y: 160, width: 800, height: 560 } });
    const s = []; for (let i = 0; i < 6; i++) { await p.waitForTimeout(400); s.push(await stat()); }
    out[t].run = { ...info, fps: +(s.reduce((a, x) => a + x.fps, 0) / s.length).toFixed(1), calls: Math.max(...s.map((x) => x.calls)) };
    await press('ShiftLeft', false); await press('KeyW', false); await p.waitForTimeout(1200);
    if (t === 'scout') { // slide: sprint then release
      await press('KeyW', true); await press('ShiftLeft', true); await p.waitForTimeout(2200); await press('KeyW', false); await press('ShiftLeft', false); await p.waitForTimeout(280);
      await p.screenshot({ path: `test-results/run-scout-slide.png`, clip: { x: 240, y: 160, width: 800, height: 560 } });
      out[t].slide = await p.evaluate(() => +window.__robot.ctl.slide.toFixed(2));
    }
    await p.waitForTimeout(1500);
  }
  if (MODES.includes('land')) {
    await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(30); });
    await p.waitForFunction(() => { const l = window.__robot.ctl.landing; return l && l.kind !== 'none' && l.t > 0.3; }, null, { timeout: 30000, polling: 30 }).catch(() => {});
    const L = await p.evaluate(() => window.__robot.ctl.landing);
    await p.screenshot({ path: `test-results/land-${t}.png`, clip: { x: 240, y: 160, width: 800, height: 560 } });
    const s = []; for (let i = 0; i < 4; i++) { await p.waitForTimeout(150); s.push(await stat()); }
    out[t].land = { ...L, fps: +(s.reduce((a, x) => a + x.fps, 0) / s.length).toFixed(1), calls: Math.max(...s.map((x) => x.calls)) };
    await p.waitForTimeout(1500);
  }
  console.log(t, JSON.stringify(out[t]));
}
console.log('console errors', errs.length, errs.slice(0, 6)); await b.close();
