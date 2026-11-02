// Quick real-GPU WebKit check of every area: console errors, fps, draw calls, shared player state + world registry.
//   PLAYWRIGHT_BROWSERS_PATH=~/builds/.pw-browsers node tools/perf/area-check.mjs [port=5199] [out=tools/perf/out/area-check.json]
import fs from 'node:fs';
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [port = '5199', OUT = 'tools/perf/out/area-check.json'] = process.argv.slice(2);
const IDS = ['keywest', 'bayshore', 'sandyhook', 'newark', 'passaic'];
const b = await webkit.launch({ headless: false });
const errors = [], out = { areas: {} };
for (const id of IDS) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => errors.push(`[${id}] ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`[${id}] ${m.text()}`));
  await p.goto(`http://localhost:${port}/?area=${id}&join=0`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
  await p.waitForTimeout(5000); // robot drops in (skydive), player state updates
  const r = await p.evaluate(() => {
    const P = window.__player, R = window.__registry, fps = [], calls = [];
    return { player: { mode: P.mode, avatar: P.avatar, area: P.area, speed: +P.speed.toFixed(1), altitude: +P.altitude.toFixed(1), pos: P.pos.toArray().map((v) => +v.toFixed(0)), world: P.world() },
      ctlSame: window.__robot.ctl.pos === P.pos && window.__robot.ctl.vel === P.vel,
      registry: Object.fromEntries(R.areas.map((a) => [a.id, { load: a.load, exact: a.boundsExact, off: [Math.round(a.worldOffset.x), Math.round(a.worldOffset.z)] }])),
      here: R.areaAt(P.world().x, P.world().z).id };
  });
  const fps = []; const calls = []; for (let i = 0; i < 10; i++) { const s = await p.evaluate(() => ({ f: window.__city.fps, c: window.__city.calls, t: window.__city.triangles })); fps.push(s.f); calls.push(s.c); out.tri = s.t; await p.waitForTimeout(300); }
  fps.sort((x, y) => x - y);
  // free-cam mode: V toggles, player must follow the camera
  await p.keyboard.press('KeyV'); await p.waitForTimeout(1500);
  r.free = await p.evaluate(() => ({ mode: window.__player.mode, avatar: window.__player.avatar, nearCam: window.__player.pos.distanceTo(window.__cityCam.position) < 0.01 }));
  out.areas[id] = { ...r, fpsMedian: +fps[fps.length >> 1].toFixed(1), fpsMin: +fps[0].toFixed(1), calls: Math.max(...calls), tris: out.tri };
  console.log(id, JSON.stringify(out.areas[id]));
  if (id === 'keywest') { // area switch moves load states + player.area
    await p.evaluate(() => window.__switchArea('newark')); await p.waitForTimeout(2500);
    const s = await p.evaluate(() => ({ area: window.__player.area, active: window.__registry.activeId, kw: window.__registry.get('keywest').load, nw: window.__registry.get('newark').load, nwTile: !!window.__registry.get('newark').tile, kwTile: !!window.__registry.get('keywest').tile }));
    console.log('switch', JSON.stringify(s)); out.switch = s;
  }
  await p.close();
}
out.consoleErrors = errors; fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 6)); await b.close();
