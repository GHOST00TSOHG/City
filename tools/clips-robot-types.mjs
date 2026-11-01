import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
const port = process.argv[2] || '5180', OUT = '/workspace/robot-clips';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: '/tmp/clipvid', size: { width: 960, height: 540 } } });
const p = await ctx.newPage(); const T0 = Date.now(); const marks = [];
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?perf=1&area=keywest&join=0&fixeddt=0.0333`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
const simT = () => p.evaluate(() => window.__clipT ?? 0);
async function shoot(name, secs, setup) { // sim runs 1/30 s per rendered frame; wait for `secs` of SIM time, cut wall-time span
  const a = (Date.now() - T0) / 1000; await p.evaluate(() => { window.__clipF = 0; const f = () => { window.__clipF++; requestAnimationFrame(f); }; if (!window.__clipOn) { window.__clipOn = 1; f(); } });
  await p.evaluate(setup); await p.waitForFunction((n) => window.__clipF >= n, secs * 30, { timeout: 900000, polling: 200 });
  marks.push([name, a, (Date.now() - T0) / 1000 - a]);
}
for (const t of ['scout', 'heavy', 'worker', 'glitch']) {
  await p.evaluate((t) => window.__robot.setType(t), t);
  await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30); });
  await p.waitForTimeout(1500);
  await shoot(`${t}-walk`, 6, () => window.__robot.ctl.press('KeyW', true));
  await p.evaluate(() => window.__robot.ctl.press('KeyW', false));
  if (t === 'heavy' || t === 'glitch') {
    await p.waitForTimeout(800);
    await shoot(t === 'heavy' ? 'heavy-groundpound' : 'glitch-blinkdash', 4, () => setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })), 600));
  }
}
console.log('errors', errs.length, errs.slice(0, 5));
const vid = await p.video().path(); await ctx.close(); await b.close();
// video starts at page creation; T0 is later by the load time
execSync(`ffmpeg -y -loglevel error -i ${vid} -vsync passthrough -c:v libx264 -preset veryfast -pix_fmt yuv420p /tmp/clip-session.mp4`); const lead = 0;
for (const [n, a, d] of marks) { execSync(`ffmpeg -y -loglevel error -ss ${(a + lead).toFixed(2)} -t ${d} -i /tmp/clip-session.mp4 -vf mpdecimate,setpts=N/30/TB -r 30 -c:v libx264 -pix_fmt yuv420p ${OUT}/${n}.mp4`); console.log(n, OUT + '/' + n + '.mp4'); }
