// Run F shots (real Mac WebKit, headless:false, 1920x1080, jpg): the open items + the two seams. Same names/views for before and after.
//   node tools/perf/connect-shots.mjs <outdir> [port] [only-substring]
import os from 'node:os';
import fs from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [outDir, port = "5190", only = "", extra = ""] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
async function open(query) {
  const b = await webkit.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`http://localhost:${port}/?join=0&${query}&${extra}`, { waitUntil: 'load', timeout: 300000 });
  await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
  await p.waitForTimeout(3000);
  return { b, p };
}
const want = (n) => !only || n.includes(only);

// ---- static views (all tiles built, streaming off, free camera)
// world frame (m): Passaic SE corner (2086, -15905); bay seam midline z ~ -15300 between Passaic (south edge -15905) and Sandy Hook (north -14707);
// Newark/Passaic overlap x -274..823, z -18129..-16906.
const VIEWS = [
  ['item2-passaic-se-corner-high', 1300, 260, -14900, 2086, 0, -15905],
  ['item2-passaic-se-corner-low', 1650, 70, -15450, 2086, 0, -15905],
  ['item2-passaic-se-corner-far', 800, 700, -14000, 2100, 0, -15950],
  ['item3-duval', null, null, null, null, null, null],
  ['item3-mid-passaic', null, null, null, null, null, null],
  ['item4-far-detail-below', 270, 380, -17900, 270, 0, -17000],
  ['item4-far-detail-above', 270, 460, -17900, 270, 0, -17000],
  ['seam-bay-aerial', 900, 220, -14300, 900, 0, -15300],
  ['seam-bay-low', 1100, 14, -14900, 1100, 0, -15700],
  ['seam-bay-side', 2200, 40, -15300, 600, 0, -15300],
  ['seam-overlap-aerial', 270, 300, -16300, 270, 0, -17500],
  ['seam-overlap-oblique', -700, 120, -17600, 500, 0, -17500],
  ['seam-overlap-ground', -150, 3, -17000, 400, 12, -17800],
  ['seam-overlap-roof', 700, 90, -18400, 100, 0, -17400],
  // Newark landmarks that stand inside Passaic's ground (Penn Station, Military Park pavilion, Wars of America)
  ['seam-overlap-penn-aerial', 560, 170, -17200, 586, 0, -16912],
  ['seam-overlap-penn-ground', 480, 7, -17060, 586, 14, -16912],
  ['seam-overlap-penn-side', 900, 40, -16990, 560, 10, -16912],
];
if (VIEWS.some((v) => want(v[0]))) {
  const { b, p } = await open('area=newark');
  await p.evaluate(() => window.__app.loadAll());
  await p.evaluate(() => { window.__app.stream.enabled = false; });
  await p.keyboard.press('KeyV'); await p.waitForTimeout(4000);
  const ov = await p.evaluate(() => { const R = window.__registry; return { duval: R.worldViews('keywest').find((v) => v.name === 'duval'), mid: R.worldViews('passaic')[1] }; });
  for (const v of VIEWS) {
    if (!want(v[0])) continue;
    let [name, x, y, z, lx, ly, lz] = v;
    if (name === 'item3-duval') [x, y, z, lx, ly, lz] = [...ov.duval.pos, ...ov.duval.look];
    if (name === 'item3-mid-passaic') [x, y, z, lx, ly, lz] = [...ov.mid.pos, ...ov.mid.look];
    await p.evaluate(([x, y, z, lx, ly, lz]) => { const c = window.__cityCam; c.position.set(x, y, z); c.lookAt(lx, ly, lz); window.__cityControls.syncAngles(); }, [x, y, z, lx, ly, lz]);
    await p.waitForTimeout(3500);
    await p.screenshot({ type: 'jpeg', quality: 82, path: `${outDir}/${name}.jpg` });
    console.log(name, JSON.stringify(await p.evaluate(() => ({ calls: window.__city.calls, tris: window.__city.triangles }))));
  }
  await b.close();
}

// ---- item 1: open sea at max flight speed (robot, real key input, shot while moving)
if (want('item1')) {
  const { b, p } = await open('area=newark');
  await p.evaluate(() => {
    const ctl = window.__robot.ctl, app = window.__app;
    const keys = new Set(), set = (k, on) => { if (on === keys.has(k)) return; on ? keys.add(k) : keys.delete(k); ctl.press(k, on); };
    window.__fl = { set, ctl };
    const f = app.flight, tx = (f.start.x + f.end.x) / 2, tz = (f.start.z + f.end.z) / 2;
    const s = { x: f.start.x, z: f.start.z + 3000 };
    ctl.spawn(s.x, 200, s.z, Math.atan2(f.end.x - s.x, f.end.z - s.z));
    ctl.setTuning({ cruise: 140 / 90, burst: 1 });
    window.__flTarget = { x: f.end.x, z: f.end.z, tx, tz };
    setInterval(() => {
      const P = window.__player, T = window.__flTarget; let d = Math.atan2(T.x - P.pos.x, T.z - P.pos.z) - ctl.heading;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (ctl.mode !== 'ROCKETS' && ctl.mode !== 'SKYDIVING') { set('Space', true); setTimeout(() => set('Space', false), 80); }
      set('KeyW', true); set('ShiftLeft', true); set('KeyA', d > 0.08); set('KeyD', d < -0.08);
      const alt = P.altitude; set('Space', ctl.mode === 'ROCKETS' && alt < 140); set('KeyC', alt > 160);
    }, 50);
    ctl.press('Space', true); setTimeout(() => ctl.press('Space', false), 100);
  });
  for (let i = 0; i < 4; i++) {
    await p.waitForTimeout(6000);
    const st = await p.evaluate(() => ({ speed: +window.__player.speed.toFixed(0), alt: +window.__player.altitude.toFixed(0), pos: window.__player.pos.toArray().map(Math.round), area: window.__player.area }));
    console.log('item1 state', JSON.stringify(st));
    await p.screenshot({ type: 'jpeg', quality: 82, path: `${outDir}/item1-open-sea-speed-${i}.jpg` });
  }
  await b.close();
}
console.log('console errors', errors.length, errors.slice(0, 4));
