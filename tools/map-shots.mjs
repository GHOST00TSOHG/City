// Real-GPU WebKit stills of fixed map views (headless:false; never trust headless black captures).
// node tools/map-shots.mjs <port> <outdir> [views.json] [only-substring]
//   PLAYWRIGHT_BROWSERS_PATH=~/builds/.pw-browsers
// views.json: [{name, area, pos:[x,y,z], look:[x,y,z], hold?:ms, weather?}] in world metres (x east, y up, z south).
// Writes <outdir>/<name>.png and <outdir>/shots-info.json (per-view fps median/min, draw calls, triangles) + console errors.
import fs from 'node:fs';
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [port, OUT, VJ = 'tools/map-views.json', ONLY = ''] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const views = JSON.parse(fs.readFileSync(VJ, 'utf8')).filter((v) => v.name.includes(ONLY));
const byArea = new Map(); for (const v of views) (byArea.get(v.area) ?? byArea.set(v.area, []).get(v.area)).push(v);
const b = await webkit.launch({ headless: false });
const info = { views: {}, errors: [] };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
for (const [area, list] of byArea) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => info.errors.push(`[${area}] ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && info.errors.push(`[${area}] ${m.text()}`));
  await p.goto(`http://localhost:${port}/?area=${area}&mode=free&join=0&stats=1`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
  await p.addStyleTag({ content: '.hud,#hud{display:none!important}' });
  await p.waitForTimeout(3000);
  for (const v of list) {
    await p.evaluate(([pos, look]) => {
      const c = window.__cityCam; window.__cityControls?.setWalk?.(false);
      c.position.set(...pos); c.lookAt(...look); window.__cityControls?.syncAngles?.();
      window.__lockCam = { pos, look }; // keep it pinned: the free-cam clamps/drifts otherwise
      if (!window.__pin) { window.__pin = true; const tick = () => { const L = window.__lockCam; if (L) { c.position.set(...L.pos); c.lookAt(...L.look); } requestAnimationFrame(tick); }; tick(); }
    }, [v.pos, v.look]);
    await p.waitForTimeout(v.hold ?? 2500);
    const fps = [], calls = [];
    for (let i = 0; i < 12; i++) { const s = await p.evaluate(() => ({ f: window.__city.fps, c: window.__city.calls, t: window.__city.triangles })); fps.push(s.f); calls.push(s.c); info.views[v.name] = { ...(info.views[v.name] ?? {}), triangles: s.t }; await p.waitForTimeout(150); }
    await p.screenshot({ path: `${OUT}/${v.name}.png` });
    Object.assign(info.views[v.name], { area, fpsMedian: median(fps), fpsMin: Math.min(...fps), calls: Math.max(...calls) });
    console.log(v.name, JSON.stringify(info.views[v.name]));
  }
  await p.close();
}
fs.writeFileSync(`${OUT}/shots-info.json`, JSON.stringify(info, null, 1));
console.log('errors:', info.errors.length); await b.close();
