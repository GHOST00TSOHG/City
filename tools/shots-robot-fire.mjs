// In-flight shots + fps/draw-call measurement: BROWSER=webkit|chromium node tools/shots-robot-fire.mjs [port=5180] [types]
// Real GPU, headed. Per type: take-off, climb, cruise/BURST, shot + 4 s fps/calls samples -> test-results/ingame2-<type>.png
import { chromium, webkit } from '@playwright/test';
const port = process.argv[2] || '5180', TYPES = (process.argv[3] || 'scout,heavy,worker,glitch').split(','), WK = (process.env.BROWSER || 'webkit') === 'webkit';
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] }));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('response', (r) => r.status() >= 400 && errs.push(r.status() + ' ' + r.url()));
await p.goto(`http://localhost:${port}/?area=keywest&join=0`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
const press = (c, d) => p.evaluate(([c, d]) => window.__robot.ctl.press(c, d), [c, d]);
const out = {};
for (const t of TYPES) {
  await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); });
  await p.waitForTimeout(2500);
  for (let k = 0; k < 4; k++) { // take-off (Heavy crouches first); retry until the rockets are on
    await press('KeyF', true); await press('KeyF', false); await p.waitForTimeout(1400);
    if (await p.evaluate(() => window.__robot.ctl.mode === 'ROCKETS')) break;
  }
  await press('Space', true); await p.waitForTimeout(2200); await press('Space', false); await p.waitForTimeout(700);
  await p.screenshot({ path: `test-results/ingame2-${t}.png` }); // climbing / hover: fire close behind the robot
  await press('KeyW', true); await p.waitForTimeout(1200); await press('ShiftLeft', true); await p.waitForTimeout(1500);
  await p.screenshot({ path: `test-results/ingame2-${t}-burst.png` });
  const samples = []; for (let i = 0; i < 8; i++) { await p.waitForTimeout(500); samples.push(await p.evaluate(() => [window.__city.fps, window.__city.calls, window.__city.robot?.mode])); }
  await press('ShiftLeft', false); await press('KeyW', false);
  out[t] = { fps: +(samples.reduce((a, s) => a + s[0], 0) / samples.length).toFixed(1), calls: Math.max(...samples.map((s) => s[1])), mode: samples.at(-1)[2] };
  console.log(t, JSON.stringify(out[t]));
}
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
