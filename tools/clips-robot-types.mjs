// Robot clips: node tools/clips-robot-types.mjs [port=5180]  (expects `npx vite --port <port>`)
// Deterministic frame stepping (?fixeddt + window.__steps): each screenshot = one 1/20 s sim step, so clips play in real
// time at 20 fps even on SwiftShader. Out: /workspace/robot-clips/<type>-walk.mp4, heavy-groundpound.mp4, glitch-blinkdash.mp4
import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
const port = process.argv[2] || '5180', OUT = '/workspace/robot-clips', FPS = 20;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?perf=1&area=keywest&join=0&fixeddt=${1 / FPS}`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
async function shoot(name, secs, at = {}) {
  const dir = `/tmp/clip-${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let i = 0; i < secs * FPS; i++) {
    if (at[i]) await p.evaluate(at[i]);
    await p.evaluate(() => (window.__steps = 1)); await p.waitForFunction(() => window.__steps <= 0, null, { timeout: 120000, polling: 'raf' });
    await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, quality: 85, timeout: 240000 });
  }
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${dir}/%04d.jpg -c:v libx264 -pix_fmt yuv420p ${OUT}/${name}.mp4`);
  console.log(`${OUT}/${name}.mp4`);
}
await p.evaluate(() => (window.__steps = 0));
for (const t of ['scout', 'heavy', 'worker', 'glitch']) {
  await p.evaluate(() => (window.__steps = 1e9));
  await p.evaluate((t) => window.__robot.setType(t), t);
  await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30); });
  await p.waitForTimeout(3000); await p.evaluate(() => (window.__steps = 0));
  await shoot(`${t}-walk`, 4, { 0: () => window.__robot.ctl.press('KeyW', true) });
  await p.evaluate(() => window.__robot.ctl.press('KeyW', false));
  if (t === 'heavy') await shoot('heavy-groundpound', 2.5, { 8: () => window.__robot.ctl.press('KeyZ', true), 9: () => window.__robot.ctl.press('KeyZ', false) });
  if (t === 'glitch') await shoot('glitch-blinkdash', 2.5, { 8: () => window.__robot.ctl.press('KeyZ', true), 9: () => window.__robot.ctl.press('KeyZ', false) });
}
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
