// Run F seam probe (real WebKit): ground height along lines crossing the Passaic <-> Sandy Hook bay seam, from every ground mesh (far rings, link strips), with the
// tile that owns the point; flags a step > 1 m between neighbouring samples and any ground above sea level that is not inside a tile or link.
//   node tools/perf/seam-probe.mjs [port]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const port = process.argv[2] ?? '5190';
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:${port}/?join=0&area=newark`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.evaluate(() => window.__app.loadAll());
await p.evaluate(() => { window.__app.stream.enabled = false; });
await p.waitForTimeout(8000);
const r = await p.evaluate(() => {
  const T = window.__THREE, scene = window.__cityScene, rc = new T.Raycaster(), meshes = [];
  scene.traverse((o) => { if (o.isMesh && (o.name === 'far-ground' || o.name === 'link-ground') && o.visible) meshes.push(o); });
  const hit = (x, z) => { rc.set(new T.Vector3(x, 500, z), new T.Vector3(0, -1, 0)); rc.far = 1000; const hs = rc.intersectObjects(meshes, false); return hs.map((h) => +h.point.y.toFixed(2)); };
  const lines = [];
  for (const x of [-200, 300, 800, 1300, 1800, 2300]) {
    const row = [];
    for (let z = -15905; z <= -14707; z += 100) row.push([z, hit(x, z)]);
    lines.push({ x, row });
  }
  const tiles = window.__world().tiles.map((t) => ({ id: t.id, b: t.bounds }));
  return { lines, tiles };
});
for (const l of r.lines) console.log('x', l.x, l.row.map(([z, h]) => `${z}:${h.join('/') || '-'}`).join('  '));
await b.close();
