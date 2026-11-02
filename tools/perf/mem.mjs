// Memory: WebKit WebContent RSS (ps) + scene geometry bytes by mesh kind and attribute, all tiles built.
//   node tools/perf/mem.mjs [--port 5199] [--label before] [--stream] [--out tools/perf/out/mem-<label>.json]
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5199'), LABEL = arg('label', 'run');
/** Playwright's WebKit processes (its own build under .pw-browsers), RSS in MB per kind. */
export const rss = () => {
  const out = execSync('ps -axo pid=,rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n');
  const r = {}; let tot = 0;
  for (const l of out) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); if (!m || !/pw-browsers|ms-playwright/.test(m[3])) continue;
    const kind = /WebContent/.test(m[3]) ? 'WebContent' : /GPU/.test(m[3]) ? 'GPU' : /Networking/.test(m[3]) ? 'Network' : 'other';
    r[kind] = (r[kind] ?? 0) + +m[2] / 1024; tot += +m[2] / 1024;
  }
  for (const k in r) r[k] = Math.round(r[k]);
  r.total = Math.round(tot); return r;
};
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const t0 = Date.now(), timeline = []; const sampler = setInterval(() => { const r = rss(); timeline.push([Math.round((Date.now() - t0) / 1000), r.WebContent, r.GPU]); }, 1500);
await p.goto(`http://localhost:${PORT}/?area=${arg('area', 'newark')}&join=0${arg('q', '')}`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.waitForTimeout(2000);
const out = { label: LABEL, rssAfterFirstTile: rss(), loadMs: Date.now() - t0 };
if (!process.argv.includes('--stream') && !process.argv.includes('--first')) await p.evaluate(() => { window.__app.stream.enabled = false; return window.__app.loadAll(); });
await p.waitForTimeout(4000);
out.rssAllTiles = rss();
out.geo = await p.evaluate(() => {
  const seen = new Set(), kinds = {}; let tot = 0;
  for (const tile of window.__cityScene.children.filter((c) => c.name.startsWith('area:') || c.name.startsWith('link:'))) {
    tile.traverse((o) => {
      const g = o.geometry; if (!g) return;
      const k = (tile.name.startsWith('link:') ? 'link ' : '') + (o.name.replace(/[0-9 -]+$/, '').replace(/^bld.*/, 'bld chunk').replace(/^trees.*/, 'trees').replace(/^landmark.*/, 'landmark') || o.type);
      const e = (kinds[k] ??= { MB: 0, n: 0, attr: {} });
      const add = (name, arr) => { if (!arr || seen.has(arr)) return; seen.add(arr); e.MB += arr.byteLength / 1048576; e.attr[name] = (e.attr[name] ?? 0) + arr.byteLength / 1048576; tot += arr.byteLength; };
      for (const [n, a] of Object.entries(g.attributes)) add(n, a.array);
      if (g.index) add('index', g.index.array);
      if (g.userData.gpuBytes) add('released', { byteLength: g.userData.gpuBytes });
      add('inst', o.instanceMatrix?.array); add('inst', o.instanceColor?.array); e.n++;
    });
  }
  const r2 = (x) => +x.toFixed(1);
  for (const e of Object.values(kinds)) { e.MB = r2(e.MB); for (const k in e.attr) e.attr[k] = r2(e.attr[k]); }
  return { totalMB: r2(tot / 1048576), kinds, tiles: window.__world().tiles.length, calls: window.__renderer.info.render.drawCalls, tris: window.__renderer.info.render.triangles };
});
clearInterval(sampler); out.timeline = timeline.map((t) => t.join(':')).join(' '); out.peakWebContent = Math.max(...timeline.map((t) => t[1])); out.rssFinal = rss();
out.errors = errors.length; out.errorSample = [...new Set(errors)].slice(0, 5);
await b.close();
fs.writeFileSync(arg('out', `tools/perf/out/mem-${LABEL}.json`), JSON.stringify(out, null, 1));
console.log('timeline(s:WebContentMB:GPUMB)', out.timeline, 'peakWebContent', out.peakWebContent);
console.log(JSON.stringify({ rss1: out.rssAfterFirstTile, rssAll: out.rssAllTiles, rssFinal: out.rssFinal, totalMB: out.geo.totalMB, tiles: out.geo.tiles, errors: out.errors }));
for (const [k, v] of Object.entries(out.geo.kinds).sort((a, b) => b[1].MB - a[1].MB).slice(0, 14)) console.log(k.padEnd(18), String(v.MB).padStart(7), 'MB', JSON.stringify(v.attr));
