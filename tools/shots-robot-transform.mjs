// Transformation frame strip: BROWSER=webkit node tools/shots-robot-transform.mjs [port] [types=heavy,scout,worker,glitch] → test-results/transform-<type>.png (fold frames + closed + unfold frames)
import { chromium, webkit } from '@playwright/test'; import { execSync } from 'child_process';
const port = process.argv[2] || '5180', TYPES = (process.argv[3] || 'heavy,scout,worker,glitch').split(','), WK = (process.env.BROWSER || 'webkit') === 'webkit';
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] }));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?area=keywest&join=0&fixeddt=${1 / 60}`, { waitUntil: 'load', timeout: 240000 }); await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
const step = (n) => p.evaluate(async (n) => { for (let i = 0; i < n; i++) { window.__steps = 1; await new Promise((r) => { const t = () => (window.__steps <= 0 ? r() : requestAnimationFrame(t)); t(); }); } }, n);
const F = process.env.FFMPEG || '/tmp/ffm/node_modules/ffmpeg-static/ffmpeg';
for (const t of TYPES) {
  await p.evaluate(() => (window.__steps = 1e9)); await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 90; i++) r.ctl.update(1 / 30); }); await p.waitForTimeout(1200); await p.evaluate(() => (window.__steps = 0));
  await p.evaluate((a) => { window.__robot.ctl.camSide = a; window.__robot.ctl.press('KeyW', true); window.__robot.ctl.press('ShiftLeft', true); }, +(process.env.CAM_SIDE ?? 1.05)); // 3/4 side view so the silhouette (flat / low / ball) reads
  const shots = [], st = async (n, name) => { await step(n); const f = `/tmp/tr-${t}-${name}.png`; await p.screenshot({ path: f, clip: { x: 340, y: 200, width: 600, height: 460 } }); shots.push(f); return p.evaluate(() => +(window.__robot.ctl.form).toFixed(2)); };
  const prog = []; for (let i = 0; i < 6; i++) prog.push(await st(i === 0 ? 6 : 8, `f${i}`));
  await step(90); prog.push(await st(1, 'run'));
  await p.evaluate(() => { window.__robot.ctl.press('KeyW', false); window.__robot.ctl.press('ShiftLeft', false); });
  for (let i = 0; i < 4; i++) prog.push(await st(i === 0 ? 14 : 12, `u${i}`));
  execSync(`${F} -y -loglevel error -pattern_type glob -i '/tmp/tr-${t}-*.png' -vf "scale=380:-1,tile=4x3" -frames:v 1 test-results/transform-${t}${process.env.STRIP_SUFFIX ?? ''}.png`);
  console.log(t, 'form progress', prog.join(' '));
}
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
