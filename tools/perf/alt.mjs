// High-altitude cost probe (real WebKit): all tiles built, robot at ALT m over the start, fps / calls / triangles, then with one mesh kind hidden at a time.
//   node tools/perf/alt.mjs [alt=6000] [port=5199]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const ALT = +(process.argv[2] ?? 6000), PORT = process.argv[3] ?? '5199';
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`http://localhost:${PORT}/?area=newark&join=0&mode=free`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.evaluate(() => { window.__app.stream.enabled = false; return window.__app.loadAll(); });
await p.waitForTimeout(3000);
await p.evaluate((alt) => { const s = window.__app.spawnPoint(), c = window.__cityCam; c.position.set(s.x + 3000, alt, s.z + 9000); c.lookAt(s.x, 0, s.z - 4000); window.__cityControls.syncAngles(); }, ALT); // oblique: Newark ahead, the shore pair and the sea beyond
await p.waitForTimeout(5000);
const measure = () => p.evaluate(() => new Promise((res) => {
  const d = []; let l = 0; const t0 = performance.now(), r = window.__renderer.info.render; let calls = 0, tris = 0;
  const f = (t) => { if (l) { d.push(t - l); calls = r.drawCalls ?? r.calls; tris = r.triangles; } l = t; if (t - t0 < 4000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ fpsMed: +(1000 / d[d.length >> 1]).toFixed(1), worstMs: +d[d.length - 1].toFixed(1), calls, trisM: +(tris / 1e6).toFixed(2), alt: Math.round(window.__player.altitude), far: window.__world().fastHigh }); } };
  requestAnimationFrame(f);
}));
console.log('base', JSON.stringify(await measure()));
for (const [label, re] of [['no trees', '^trees'], ['no roads', '^roads'], ['no terrain', '^terrain$'], ['no buildings', '^(bld|buildings)'], ['no far ring / sea', 'far-ground|ocean|sea']]) {
  await p.evaluate((src) => { const re = new RegExp(src); window.__hid = []; window.__cityScene.traverse((o) => { if (o.isMesh && o.visible && re.test(o.name)) { o.visible = false; window.__hid.push(o); } }); }, re);
  console.log(label, JSON.stringify(await measure()));
  await p.evaluate(() => window.__hid.forEach((o) => (o.visible = true)));
}
await b.close();
