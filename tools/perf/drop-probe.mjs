// Unload hitch probe: load Newark (+Passaic), wait, drop a tile, record rAF frame times for 4 s after. Real WebKit.
//   node tools/perf/drop-probe.mjs [--port 5199] [--q disp=none] [--drop newark]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const b = await webkit.launch({ headless: false }), p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('console', (m) => { if (/dropTile|dispose step|unloaded/.test(m.text())) console.log('  [page]', m.text().slice(0, 140)); });
await p.goto(`http://localhost:${arg('port', '5199')}/?join=0&area=newark&tilelog=1&${arg('q', '')}`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.waitForTimeout(12000);
const r = await p.evaluate(async (id) => {
  const dts = [], tl = []; let last = 0, run = true;
  const tick = (t) => { if (last) dts.push([+(t - last).toFixed(0), +(t / 1000).toFixed(2)]); last = t; if (run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); await new Promise((r) => setTimeout(r, 1500));
  const t0 = performance.now(); window.__app.stream.enabled = false; window.__app.dropTile(id); const dropAt = +(t0 / 1000).toFixed(2); const sync = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 4000)); run = false;
  return { dropAt, sync, over: dts.filter((d) => d[0] > 25), n: dts.length, tiles: window.__world().tiles.map((t) => t.id) };
}, arg('drop', 'newark'));
console.log(JSON.stringify(r)); await b.close();
