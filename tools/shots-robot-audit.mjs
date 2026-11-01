// Close-up audit shots: BROWSER=webkit node tools/shots-robot-audit.mjs [port=5180] [types]  → test-results/audit-<type>-<front|back|side>.png
import { chromium, webkit } from '@playwright/test';
const port = process.argv[2] || '5180', TYPES = (process.argv[3] || 'scout,heavy,worker,glitch').split(','), WK = (process.env.BROWSER || 'webkit') === 'webkit';
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] }));
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?area=keywest&join=0`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
await p.addStyleTag({ content: '#hangar{display:none!important} .hud,#hud{display:none!important}' });
const base = await p.evaluate(() => 0);
for (const t of TYPES) {
  await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { window.__robot.hangar(true); window.__robot.hangarState.spin = 0; }); await p.waitForTimeout(2500);
  const h0 = await p.evaluate(() => window.__robot.hangarState.h);
  for (const [name, off] of [['front', 0], ['back', Math.PI], ['side', Math.PI / 2]]) {
    await p.evaluate(([h, off]) => { window.__robot.hangarState.yaw = h + off; }, [h0, off]); await p.waitForTimeout(900);
    await p.screenshot({ path: `test-results/audit-${t}-${name}.png`, clip: { x: 640, y: 150, width: 440, height: 640 } });
  }
}
// feet: low-angle close-up (camera 0.12 m above the floor, 2.2 m away, looking at the ankles) from the front-left, with the robot standing still
for (const t of TYPES) {
  await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => { const hs = window.__robot.hangarState; hs.spin = 0; hs.yaw = hs.h + 0.5; hs.shot = { d: 2.4, y: 0.25, ty: 0.2, fov: 40 }; }); await p.waitForTimeout(900);
  await p.screenshot({ path: `test-results/audit-${t}-feet.png`, clip: { x: 340, y: 250, width: 800, height: 520 } });
}
await p.evaluate(() => { window.__robot.hangarState.shot = null; });
console.log('warnings/errors', errs.length, errs.slice(0, 8)); await b.close();
