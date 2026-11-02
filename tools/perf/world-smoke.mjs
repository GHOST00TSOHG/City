// Quick real-GPU WebKit look at the connected world: loads one start area, prints world state, console errors, fps, calls; optional shots.
//   node tools/perf/world-smoke.mjs [area=newark] [query=] [port=5199]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [area = 'newark', query = '', port = '5199'] = process.argv.slice(2);
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], logs = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else logs.push(m.type() + ' ' + m.text().slice(0, 200)); });
await p.goto(`http://localhost:${port}/?area=${area}&join=0${query ? '&' + query : ''}`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 90000 }).catch(async () => { console.log('NOT READY; logs', logs, 'errors', errors.slice(0, 10)); await b.close(); process.exit(1); });
await p.waitForTimeout(6000);
const s = await p.evaluate(() => ({ city: { fps: window.__city.fps, calls: window.__city.calls, tris: window.__city.triangles }, world: window.__world(), pos: window.__player.pos.toArray().map((v) => +v.toFixed(0)), alt: window.__player.altitude }));
console.log(JSON.stringify(s));
console.log('logs', logs.slice(-12));
console.log('errors', errors.length, errors.slice(0, 8));
await p.screenshot({ path: `tools/perf/out/smoke-${area}.png` });
await b.close();
