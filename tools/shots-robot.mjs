// Robot screenshots: node tools/shots-robot.mjs [prefix] [area]  (expects `npm run dev` on :5173)
// Headless SwiftShader runs < 1 fps, so the sim is stepped by hand (fixed 1/30 s) between shots.
import { chromium } from '@playwright/test';
const prefix = process.argv[2] || 'rebuild-p7', area = process.argv[3] || 'keywest';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://localhost:5173/?perf=1&join=0&area=${area}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__city?.ready, null, { timeout: 180000 });
const sim = (secs, hold = []) => page.evaluate(({ secs, hold }) => {
  const r = window.__robot; hold.forEach((k) => r.ctl.press(k, true));
  for (let i = 0; i < secs * 30; i++) r.ctl.update(1 / 30);
  hold.forEach((k) => r.ctl.press(k, false));
  return { mode: r.ctl.mode, anim: r.ctl.anim, pos: r.ctl.pos.toArray().map((v) => +v.toFixed(1)), mph: +(r.ctl.vel.length() * 2.237).toFixed(0) };
}, { secs, hold });
const shot = async (name, wait = 6000) => { await page.waitForTimeout(wait); const s = await page.evaluate(() => window.__city); await page.screenshot({ path: `/workspace/city-shots/${prefix}-${name}.png`, timeout: 240000 }); return s; };
const out = {};
out.dropin = [await sim(0.6), await shot('1-dropin')];
out.landed = [await sim(5), await shot('2-landed')];
out.walk = [await sim(1.2, ['KeyW']), await shot('3-walk')];
await page.evaluate(() => window.__robot.ctl.press('Space', true)); // jump → then Space again = rockets
out.hover = [await sim(0.3, ['Space']), await page.evaluate(() => window.__robot.ctl.press('Space', true)), await sim(2.5, ['Space']), await shot('4-rockets-hover')];
out.fly = [await sim(4, ['KeyW', 'Space']), await sim(2, ['KeyW']), await shot('5-flight')];
out.burst = [await sim(2, ['KeyW', 'ShiftLeft', 'KeyA']), await shot('6-burst-bank')];
out.dive = [await page.evaluate(() => window.__robot.ctl.press('KeyF', true)), await sim(1.2), await shot('7-skydive')];
out.landfast = [await sim(12), await shot('8-after-landing')];
out.free = [await page.evaluate(() => window.__robot.setMode(false)), await page.evaluate(() => window.__setView('aerial')), await shot('9-freecam', 15000)];
console.log(JSON.stringify(out, null, 1));
console.log('console errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
