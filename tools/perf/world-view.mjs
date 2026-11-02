// Explore the connected world in real WebKit: fly the free camera to given world views and screenshot them.
//   node tools/perf/world-view.mjs <outdir> <start-area> '<json views [[name,x,y,z,lx,ly,lz],...] or "link"/"aerial">' [port]
import os from 'node:os';
import fs from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [outDir, area = 'newark', spec = 'link', port = '5199'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (/tile .* (built|unloaded)/.test(m.text())) console.log('  ', m.text()); });
await p.goto(`http://localhost:${port}/?area=${area}&join=0`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 120000 });
await p.waitForTimeout(3000);
await p.keyboard.press('KeyV'); await p.waitForTimeout(500); // free cam
let views = spec.startsWith('[') ? JSON.parse(spec) : null;
if (!views && spec === 'areas') views = await p.evaluate(() => window.__registry.areas.flatMap((a) => window.__registry.worldViews(a.id).map((v) => [`${a.id}-${v.name}`, ...v.pos, ...v.look])));
if (!views) {
  await p.evaluate(() => window.__app.loadAll());
  views = await p.evaluate((kind) => {
    const W = window.__world(), L = W.links, out = [];
    for (const l of L) {
      const [a, bb] = [l.path[0], l.path[l.path.length - 1]], m = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2], d = [bb[0] - a[0], bb[1] - a[1]], n = Math.hypot(...d);
      out.push([`${l.id}-ground`, a[0] - d[0] / n * 8 + 0, 3.2, a[1] - d[1] / n * 8, bb[0], 3, bb[1]]);
      out.push([`${l.id}-aerial`, m[0] + 250, 160, m[1] - 450, m[0], 0, m[1]]);
      out.push([`${l.id}-side`, m[0] + 90, 14, m[1] - 60, m[0], 1, m[1] + 60]);
    }
    return out;
  }, spec);
}
for (const [name, x, y, z, lx, ly, lz] of views) {
  await p.evaluate(([x, y, z, lx, ly, lz]) => { const c = window.__cityCam; c.position.set(x, y, z); c.lookAt(lx, ly, lz); window.__cityControls.syncAngles(); }, [x, y, z, lx, ly, lz]);
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(500); const w = await p.evaluate(() => window.__world().building.length); if (!w && i > 3) break; }
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${outDir}/${name}.png` });
  const s = await p.evaluate(() => ({ calls: window.__city.calls, tris: window.__city.triangles, tiles: window.__world().tiles.map((t) => t.id + (t.far ? '(far)' : '')).join(',') }));
  console.log(name, JSON.stringify(s));
}
console.log('errors', errors.length, errors.slice(0, 6));
await b.close();
