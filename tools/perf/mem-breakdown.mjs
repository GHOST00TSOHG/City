// GPU buffer bytes per tile and per mesh kind with every tile built (real WebKit). node tools/perf/mem-breakdown.mjs [port]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const port = process.argv[2] ?? '5199';
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`http://localhost:${port}/?area=newark&join=0`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.evaluate(() => { window.__app.stream.enabled = false; return window.__app.loadAll(); });
const r = await p.evaluate(() => {
  const seen = new Set(), out = {};
  for (const tile of window.__cityScene.children.filter((c) => c.name.startsWith('area:') || c.name.startsWith('link:'))) {
    const per = {};
    tile.traverse((o) => {
      const g = o.geometry; if (!g) return; let by = 0, tris = 0;
      for (const a of Object.values(g.attributes)) if (a.array && !seen.has(a.array)) { seen.add(a.array); by += a.array.byteLength; }
      if (g.index && !seen.has(g.index.array)) { seen.add(g.index.array); by += g.index.array.byteLength; }
      for (const a of [o.instanceMatrix, o.instanceColor]) if (a && !seen.has(a.array)) { seen.add(a.array); by += a.array.byteLength; }
      tris = (g.index?.count ?? g.attributes.position?.count ?? 0) / 3;
      const k = o.name.replace(/[0-9 -]+$/, '').replace(/^bld.*/, 'bld chunk').replace(/^trees.*/, 'trees').replace(/^landmark.*/, 'landmark') || o.type;
      per[k] = per[k] ?? { MB: 0, tris: 0, n: 0 }; per[k].MB += by / 1048576; per[k].tris += tris; per[k].n++;
    });
    out[tile.name] = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { MB: +v.MB.toFixed(1), kTris: Math.round(v.tris / 1000), n: v.n }]).filter(([, v]) => v.MB >= 0.3));
  }
  return out;
});
for (const [t, v] of Object.entries(r)) console.log(t, JSON.stringify(v));
await b.close();
