// Flight clips: node tools/clips-robot-fly.mjs [port=5180] [types=scout,heavy,worker,glitch]  (expects `npx vite --port <port>`)
// Deterministic stepping (?fixeddt + window.__steps), one sim step per frame (CLIP_FPS, default 12). Per type: take-off (F), climb,
// hover, cruise with a banked turn, hover, descend and land. Out: robot-clips/<type>-fly.mp4 (or /workspace/robot-clips on the box)
import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
const port = process.argv[2] || '5180', OUT = process.env.CLIP_OUT || (fs.existsSync('/workspace') ? '/workspace/robot-clips' : `${process.env.HOME}/builds/City-gh/robot-clips`), FPS = +(process.env.CLIP_FPS || 12);
const SWIFT = process.env.SWIFTSHADER === '1'; // default: real GPU (headed Chrome); SWIFTSHADER=1 for the box
const TYPES = (process.argv[3] || 'scout,heavy,worker,glitch').split(',');
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(SWIFT ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
  : { channel: process.env.CLIP_CHANNEL || 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?perf=1&area=keywest&join=0&fixeddt=${1 / FPS}`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
const key = (c, d) => [c, d];
const s = (sec) => Math.round(sec * FPS);
async function shoot(name, secs, at) {
  const dir = `/tmp/clip-${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let i = 0; i < secs * FPS; i++) {
    for (const [c, d] of at[i] ?? []) await p.evaluate(([c, d]) => window.__robot.ctl.press(c, d), [c, d]);
    await p.evaluate(() => (window.__steps = 1)); await p.waitForFunction(() => window.__steps <= 0, null, { timeout: 120000, polling: 100 });
    // grab the canvas in-page inside a rAF (page.screenshot costs ~25 s/frame on SwiftShader)
    const url = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL('image/jpeg', 0.88)))));
    fs.writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  execSync(`${process.env.FFMPEG || "ffmpeg"} -y -loglevel error -framerate ${FPS} -i ${dir}/%04d.jpg -c:v libx264 -pix_fmt yuv420p ${OUT}/${name}.mp4`);
  console.log(`${OUT}/${name}.mp4`);
}
await p.evaluate(() => (window.__steps = 0));
for (const t of TYPES) {
  await p.evaluate(() => (window.__steps = 1e9));
  await p.evaluate((t) => window.__robot.setType(t), t);
  await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30); });
  await p.waitForTimeout(3000); await p.evaluate(() => (window.__steps = 0));
  const at = {};
  const add = (sec, ...f) => (at[s(sec)] ??= []).push(...f);
  add(0.3, key('KeyF', true), key('KeyF', false));            // take-off (Heavy: crouch-and-launch)
  add(0.8, key('Space', true)); add(2.0, key('Space', false)); // climb
  add(2.8, key('KeyW', true)); add(3.6, key('KeyA', true)); add(4.3, key('KeyA', false)); add(5.0, key('KeyW', false)); // cruise + banked turn
  add(5.8, key('KeyC', true));                                 // descend -> landing burn -> touchdown
  await shoot(`${t}-fly`, 9.5, at);
  await p.evaluate(() => { const c = window.__robot.ctl; for (const k of ['KeyC', 'KeyW', 'KeyA', 'Space']) c.press(k, false); });
  console.log(t, await p.evaluate(() => { const r = window.__app?.renderer ?? window.__city?.renderer; return r?.info?.render?.drawCalls ?? null; }));
}
console.log('console errors', errs.length, errs.slice(0, 5)); await b.close();
