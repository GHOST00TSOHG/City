// Run + landing clips: BROWSER=webkit CLIP_FPS=24 FFMPEG=... node tools/clips-robot-motion.mjs [port=5180] [types] [scenes=run,land]
// Deterministic stepping (?fixeddt). run: sprint down the street (hold W+Shift 3 s, release: slide / unfold); land: drop from 30 m and film the landing.
// Out: robot-clips/<type>-run.mp4, robot-clips/<type>-land.mp4 (not committed)
import { chromium, webkit } from '@playwright/test'; import { execSync } from 'child_process'; import fs from 'fs';
const port = process.argv[2] || '5180', TYPES = (process.argv[3] || 'scout,heavy,worker,glitch').split(','), SCENES = (process.argv[4] || 'run,land').split(','), FPS = +(process.env.CLIP_FPS || 24), WK = (process.env.BROWSER || 'webkit') === 'webkit';
const OUT = process.env.CLIP_OUT || `${process.env.HOME}/builds/City-gh/robot-clips`; fs.mkdirSync(OUT, { recursive: true });
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] }));
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?perf=1&area=keywest&join=0&fixeddt=${1 / FPS}`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
const s = (sec) => Math.round(sec * FPS);
async function shoot(name, secs, at) {
  const dir = `/tmp/clip-${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let i = 0; i < secs * FPS; i++) {
    for (const [c, d] of at[i] ?? []) await p.evaluate(([c, d]) => window.__robot.ctl.press(c, d), [c, d]);
    await p.evaluate(() => (window.__steps = 1)); await p.waitForFunction(() => window.__steps <= 0, null, { timeout: 120000, polling: 30 });
    const url = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL('image/jpeg', 0.88)))));
    fs.writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  execSync(`${process.env.FFMPEG || 'ffmpeg'} -y -loglevel error -framerate ${FPS} -i ${dir}/%04d.jpg -c:v libx264 -pix_fmt yuv420p ${OUT}/${name}.mp4`); console.log(`${OUT}/${name}.mp4`);
}
await p.evaluate(() => (window.__steps = 0));
for (const t of TYPES) {
  await p.evaluate(() => (window.__steps = 1e9)); await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  for (const sc of SCENES) {
    await p.evaluate(() => (window.__steps = 1e9));
    if (sc === 'run') await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 90; i++) r.ctl.update(1 / 30); });
    else await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(30); });
    if (sc === 'run') await p.waitForTimeout(1500); await p.evaluate(() => (window.__steps = 0)); // (land: stop the free-running loop immediately so the whole fall is filmed)
    const at = {}, add = (sec, c, d) => (at[s(sec)] ??= []).push([c, d]);
    if (process.env.CAM_SIDE) await p.evaluate((a) => (window.__robot.ctl.camSide = a), +process.env.CAM_SIDE); // optional 3/4 side camera
    if (sc === 'run') { add(0.3, 'KeyW', true); add(1.0, 'ShiftLeft', true); add(4.3, 'KeyW', false); add(4.3, 'ShiftLeft', false); await shoot(`${t}-run`, 6.5, at); }
    else await shoot(`${t}-land`, 4.6, at);
    await p.evaluate(() => { const c = window.__robot.ctl; for (const k of ['KeyW', 'ShiftLeft']) c.press(k, false); });
  }
}
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
