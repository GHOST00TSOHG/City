// Real-GPU WebKit check of the connected world (run B).
//   PLAYWRIGHT_BROWSERS_PATH=~/builds/.pw-browsers node tools/perf/world-check.mjs [--port 5199] [--only static|perf|inspect] [--out tools/perf/out]
//
//  static  : all 5 tiles built at once (streaming off): fps median/min, draw calls, triangles, memory (geometry + instance + texture bytes, host typed arrays,
//            renderer.info), console errors, at ground / aerial views of every area + the link roads. Screenshots -> connect-shots/.
//  perf    : scripted flight (robot controller, real key input): Newark -> Passaic -> NJ link -> Sandy Hook -> Highlands -> Key West fly-over, ~60 m/s at 120 m
//            over NJ, then 140 m/s at 150 m over the sea (test tuning: cruise = burst = 140 m/s). Samples fps / draw calls / triangles / memory every second,
//            pop-in (a tile inside the frustum within POP_DIST of the camera that is not built) every 0.5 s, long frames.
//  inspect : the same flight with a ground-void ray test (rays through the lower screen half must hit terrain / ring / link ground before 30 km) every 3 s,
//            screenshots during the flight (+ blank/sky-only analysis by tools/perf/shot-stats.py).
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5199'), ONLY = arg('only', 'all'), OUT = arg('out', 'tools/perf/out'), SHOTS = `${OUT}/connect-shots`, W = 1920, H = 1080, POP_DIST = 8000;
fs.mkdirSync(SHOTS, { recursive: true });
const results = { when: new Date().toISOString(), viewport: [W, H], budget: { fps: 50, calls: 150 } };
const errorsAll = [];

async function open(query) {
  const b = await webkit.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning' || /City\]/.test(m.text())) console.log('  [page]', m.text().slice(0, 160)); });
  p.on('crash', () => console.log('  PAGE CRASHED'));
  p.on('close', () => console.log('  page closed'));
  await p.goto(`http://localhost:${PORT}/?join=0&${query}`, { waitUntil: 'load', timeout: 300000 });
  await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
  await p.waitForTimeout(3000);
  return { b, p, errors };
}

// ---- in-page helpers (installed once per page) ----
const HELPERS = () => {
  const THREE = window.__THREE, app = window.__app, reg = window.__registry;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
  window.__h = {
    memory(light) { // light: reuse the texture estimate (the node-graph walk takes seconds and would stall the flight)
      const seen = new Set(), tseen = new Set(); let geo = 0, inst = 0, tex = 0, texCount = 0;
      const addTex = (t) => { if (!t || tseen.has(t) || !t.isTexture) return; tseen.add(t); const im = t.image, w = im?.width || im?.naturalWidth || 0, h = im?.height || im?.naturalHeight || 0, d = im?.depth || t.image?.depth || 1; const comp = t.isCompressedTexture || t.isCompressedArrayTexture ? 0.25 : 4; tex += w * h * d * comp * 1.33; texCount++; };
      const scan = (n) => { try { n.traverse?.((x) => { if (x.isTextureNode || x.isTexture3DNode) addTex(x.value); }); } catch { /* node graph walk is best-effort */ } };
      window.__cityScene.traverse((o) => {
        const g = o.geometry;
        if (g) for (const a of Object.values(g.attributes)) { const arr = a.array; if (arr && !seen.has(arr)) { seen.add(arr); (a.isInstancedBufferAttribute ? (inst += arr.byteLength) : (geo += arr.byteLength)); } }
        if (g?.index && !seen.has(g.index.array)) { seen.add(g.index.array); geo += g.index.array.byteLength; }
        for (const a of [o.instanceMatrix, o.instanceColor]) if (a && !seen.has(a.array)) { seen.add(a.array); inst += a.array.byteLength; }
        if (!light) for (const m of [o.material].flat()) if (m) { for (const k of Object.keys(m)) { const v = m[k]; if (v?.isTexture) addTex(v); else if (v?.isNode && k.endsWith('Node')) scan(v); } }
      });
      let host = 0; for (const a of reg.areas) if (a.bundle) { host += a.bundle.terrain.h.byteLength + a.bundle.terrain.cover.byteLength + (a.bundle.mask?.byteLength ?? 0); }
      const mem = window.__renderer.info.memory, heap = performance.memory?.usedJSHeapSize ?? null;
      return { geoMB: +(geo / 1048576).toFixed(1), instMB: +(inst / 1048576).toFixed(1), texMB: light ? window.__texMB : (window.__texMB = +(tex / 1048576).toFixed(1)), gpuMB: +((geo + inst + (light ? window.__texMB * 1048576 : tex)) / 1048576).toFixed(1), hostArraysMB: +(host / 1048576).toFixed(1),
        heapMB: heap === null ? null : +(heap / 1048576).toFixed(1), infoGeometries: mem.geometries, infoTextures: mem.textures, tiles: window.__world().tiles.length };
    },
    frames(ms) { // rAF frame times for `ms`, plus draw calls / triangles per frame
      return new Promise((res) => {
        const dts = [], calls = [], tris = []; let last = 0; const t0 = performance.now(), r = window.__renderer.info.render;
        const tick = (t) => { if (last) { dts.push(t - last); calls.push(r.drawCalls ?? r.calls); tris.push(r.triangles); } last = t; if (t - t0 < ms) requestAnimationFrame(tick); else res({ dts, calls, tris }); };
        requestAnimationFrame(tick);
      });
    },
    stats(f) { const d = f.dts; return { frames: d.length, fpsMedian: +(1000 / med(d)).toFixed(1), fpsMin: +(1000 / Math.max(...d)).toFixed(1), worstMs: +Math.max(...d).toFixed(1), over33: d.filter((v) => v > 33.4).length, calls: Math.max(...f.calls), callsMedian: med(f.calls), triangles: Math.max(...f.tris) }; },
    // tiles inside the frustum within `dist` that are not built
    popIn(dist) {
      const cam = window.__cityCam; cam.updateMatrixWorld(); const fr = new THREE.Frustum(), m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m);
      const built = new Set(window.__world().tiles.map((t) => t.id)), out = [];
      for (const a of reg.areas) {
        const b = a.bounds, d = reg.distTo(a.id, cam.position.x, cam.position.z); if (d > dist) continue;
        if (fr.intersectsBox(new THREE.Box3(new THREE.Vector3(b.minX, -60, b.minZ), new THREE.Vector3(b.maxX, 300, b.maxZ))) && !built.has(a.id)) out.push({ id: a.id, dist: Math.round(d) });
      }
      return out;
    },
    // rays through the lower half of the screen: must hit ground (terrain / far ring / link) when the sea plane would be reached within 30 km
    voidRays() {
      const cam = window.__cityCam, rc = new THREE.Raycaster(), ground = []; let miss = 0, tested = 0; const details = [];
      window.__cityScene.traverse((o) => { if (o.isMesh && (o.name === 'terrain' || o.name === 'far-ground' || o.name === 'link-ground') && o.visible) ground.push(o); });
      for (const sy of [0.3, 0.55, 0.8]) for (const sx of [-0.8, -0.4, 0, 0.4, 0.8]) {
        rc.setFromCamera(new THREE.Vector2(sx, -sy), cam); const d = rc.ray.direction; if (d.y > -0.01) continue;
        const tHit = -rc.ray.origin.y / d.y; if (tHit > 30000) continue; tested++; rc.far = 38000;
        const hit = rc.intersectObjects(ground, false); if (!hit.length) { miss++; details.push({ sx, sy, at: [Math.round(rc.ray.origin.x + d.x * tHit), Math.round(rc.ray.origin.z + d.z * tHit)] }); }
      }
      return { tested, miss, details };
    },
    state() { const P = window.__player, c = window.__robot.ctl; return { pos: P.pos.toArray().map((v) => +v.toFixed(0)), speed: +P.speed.toFixed(1), alt: +P.altitude.toFixed(0), mode: c.mode, area: P.area, burst: +c.burst.toFixed(2) }; },
  };
};

// ---------------------------------------------------------------- static
async function staticPhase() {
  const { b, p, errors } = await open('area=newark');
  await p.evaluate(HELPERS);
  await p.evaluate(() => window.__app.loadAll());
  await p.evaluate(() => { window.__app.stream.enabled = false; });
  await p.keyboard.press('KeyV'); await p.waitForTimeout(3000); // free cam, everything built
  const views = await p.evaluate(() => {
    const R = window.__registry, W = window.__world(), v = [];
    for (const a of R.areas) { const wv = R.worldViews(a.id); v.push([`aerial-${a.id}`, ...wv[0].pos, ...wv[0].look]); if (wv[1]?.pos[1] > 3) v.push([`mid-${a.id}`, ...wv[1].pos, ...wv[1].look]); }
    for (const l of W.links) { const [a, bb] = [l.path[0], l.path[l.path.length - 1]], m = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2], d = [bb[0] - a[0], bb[1] - a[1]], n = Math.hypot(...d);
      v.push([`ground-${l.id}`, a[0] - d[0] / n * 6, 3.2, a[1] - d[1] / n * 6, bb[0], 3, bb[1]]);
      v.push([`aerial-${l.id}`, m[0] + 250, 160, m[1] - 450, m[0], 0, m[1]]); }
    const k = R.worldViews('keywest')[2]; v.push(['ground-keywest-duval', ...k.pos, ...k.look]);
    return v;
  });
  const per = [];
  for (const [name, x, y, z, lx, ly, lz] of views) {
    await p.evaluate(([x, y, z, lx, ly, lz]) => { const c = window.__cityCam; c.position.set(x, y, z); c.lookAt(lx, ly, lz); window.__cityControls.syncAngles(); }, [x, y, z, lx, ly, lz]);
    await p.waitForTimeout(2500);
    const f = await p.evaluate(() => window.__h.frames(4000)); const st = await p.evaluate((f) => window.__h.stats(f), f);
    await p.screenshot({ path: `${SHOTS}/${name}.png` });
    per.push({ view: name, ...st }); console.log('static', name, JSON.stringify(st));
  }
  const mem = await p.evaluate(() => window.__h.memory());
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  results.static = { tilesBuilt: await p.evaluate(() => window.__world().tiles.map((t) => t.id)), memory: mem, views: per,
    fpsMedian: med(per.map((v) => v.fpsMedian)), fpsMin: Math.min(...per.map((v) => v.fpsMin)), callsMax: Math.max(...per.map((v) => v.calls)), trianglesMax: Math.max(...per.map((v) => v.triangles)), consoleErrors: errors.length };
  console.log('static summary', JSON.stringify({ ...results.static, views: undefined }));
  errorsAll.push(...errors.map((e) => '[static] ' + e)); await b.close();
}

// ---------------------------------------------------------------- flight
async function flightPhase(kind) {
  const inspect = kind === 'inspect';
  const { b, p, errors } = await open('area=newark');
  await p.evaluate(HELPERS);
  await p.evaluate(() => window.__h.memory()); // one full pass for the texture estimate
  const shots = [];
  await p.evaluate(({ inspect, POP_DIST }) => {
    const reg = window.__registry, R = window.__robot, ctl = R.ctl, app = window.__app;
    const off = (id) => reg.get(id).worldOffset, bnd = (id) => reg.get(id).bounds;
    const P = (id, x, z) => [off(id).x + x, z];
    const route = [
      { to: [off('passaic').x - 1146, bnd('passaic').maxZ - 200], speed: 60, alt: 120, name: 'Passaic south edge' },
      { to: [off('sandyhook').x - 524, off('sandyhook').z - 1016], speed: 60, alt: 60, name: 'link -> Sandy Hook road' },
      { to: [off('sandyhook').x + 1681, bnd('sandyhook').maxZ + 60], speed: 60, alt: 60, name: 'Sandy Hook south' },
      { to: [off('bayshore').x + 398, bnd('bayshore').minZ + 300], speed: 60, alt: 70, name: 'Highlands shore' },
      { to: [app.flight.start.x, app.flight.start.z + 600], speed: 140, alt: 150, name: 'flight path start' },
      { to: [app.flight.end.x, app.flight.end.z], speed: 140, alt: 150, name: 'Key West fly-over' },
    ];
    void P;
    const F = window.__flight = { samples: [], pop: [], voids: [], events: [], done: false, startT: performance.now(), leg: 0, route: route.map((r) => r.name) };
    const keys = new Set(), set = (k, on) => { if (on === keys.has(k)) return; keys.has(k) ? keys.delete(k) : keys.add(k); ctl.press(k, on); };
    const s = app.spawnPoint(); ctl.spawn(s.x, s.ground + 90, s.z, Math.atan2(route[0].to[0] - s.x, route[0].to[1] - s.z));
    const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    let tuned = -1, lastSample = performance.now(), lastPop = 0, lastVoid = 0, lastMem = 0, win = { dts: [], calls: 0, tris: 0 }, prev = 0;
    const r = window.__renderer.info.render;
    const frame = (t) => {
      if (prev) { win.dts.push(t - prev); win.calls = Math.max(win.calls, r.drawCalls ?? r.calls); win.tris = Math.max(win.tris, r.triangles); } prev = t;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const iv = setInterval(() => {
      const leg = route[F.leg]; if (!leg) return;
      const p = window.__player.pos, dx = leg.to[0] - p.x, dz = leg.to[1] - p.z, dist = Math.hypot(dx, dz);
      if (tuned !== F.leg) { tuned = F.leg; ctl.setTuning({ cruise: leg.speed / 90, burst: leg.speed > 100 ? 140 / 140 : 0.7 }); F.events.push({ t: +((performance.now() - F.startT) / 1000).toFixed(1), leg: leg.name, pos: p.toArray().map((v) => Math.round(v)) }); }
      if (dist < 400) { F.leg++; if (F.leg >= route.length) { F.done = true; ['KeyW', 'ShiftLeft', 'KeyA', 'KeyD', 'Space', 'KeyC'].forEach((k) => set(k, false)); } return; }
      if (ctl.mode !== 'ROCKETS' && ctl.mode !== 'SKYDIVING') { /* landed/rolled: start rockets again */ set('Space', true); setTimeout(() => set('Space', false), 80); }
      else if (ctl.mode === 'SKYDIVING' && p.y - window.__player.altitude < 1e9) { set('Space', true); setTimeout(() => set('Space', false), 80); }
      const err = angDiff(Math.atan2(dx, dz), ctl.heading);
      set('KeyW', true); set('ShiftLeft', leg.speed > 100);
      set('KeyA', err > 0.08); set('KeyD', err < -0.08); // A raises the heading angle, D lowers it (controller: yawRate = -iR)
      const alt = window.__player.altitude; set('Space', ctl.mode === 'ROCKETS' && alt < leg.alt - 10); set('KeyC', alt > leg.alt + 10);
    }, 50);
    const sampler = setInterval(() => {
      const now = performance.now(), d = win.dts; win = { dts: [], calls: 0, tris: 0 }; const wcalls = F._wc = Math.max(F._wc ?? 0, 0);
      const st = window.__h.state(), W = window.__world();
      const sorted = [...d].sort((a, b) => a - b), med = sorted[sorted.length >> 1] ?? 0;
      F.samples.push({ t: +((now - F.startT) / 1000).toFixed(1), ...st, leg: F.leg, fpsMedian: med ? +(1000 / med).toFixed(1) : 0, fpsMin: d.length ? +(1000 / Math.max(...d)).toFixed(1) : 0, worstMs: d.length ? +Math.max(...d).toFixed(1) : 0, over33: d.filter((v) => v > 33.4).length,
        frames: d.length, calls: window.__renderer.info.render.drawCalls ?? 0, callsMax: F.winCalls ?? 0, tiles: W.tiles.map((t) => t.id + (t.far ? '*' : '')).join(','), building: W.building.join(','), fastHigh: W.fastHigh, radius: Math.round(W.stream.radius) });
      F.winCalls = 0; void wcalls; lastSample = now;
      if (now - lastPop > 500) { lastPop = now; const pi = window.__h.popIn(POP_DIST); if (pi.length) F.pop.push({ t: +((now - F.startT) / 1000).toFixed(1), pos: st.pos, missing: pi }); }
      if (now - lastMem > 5000) { lastMem = now; F.samples[F.samples.length - 1].mem = window.__h.memory(true); }
      if (inspect && now - lastVoid > 3000) { lastVoid = now; const v = window.__h.voidRays(); if (v.miss) F.voids.push({ t: +((now - F.startT) / 1000).toFixed(1), pos: st.pos, ...v }); F.voidTests = (F.voidTests ?? 0) + v.tested; }
    }, 1000);
    // per-frame max of draw calls (the 1 s sampler only sees one frame)
    const calls = () => { F.winCalls = Math.max(F.winCalls ?? 0, r.drawCalls ?? r.calls); requestAnimationFrame(calls); }; requestAnimationFrame(calls);
    F.stop = () => { clearInterval(iv); clearInterval(sampler); };
  }, { inspect, POP_DIST });
  await p.evaluate(() => { const c = window.__robot.ctl; c.press('Space', true); setTimeout(() => c.press('Space', false), 100); });
  let shotN = 0, nextShot = 15; const t0 = Date.now();
  while (Date.now() - t0 < 600000) {
    await p.waitForTimeout(1000);
    const done = await p.evaluate(() => window.__flight.done);
    const el = (Date.now() - t0) / 1000;
    if (inspect && el > nextShot) { nextShot += 22; const st = await p.evaluate(() => window.__h.state()); const name = `flight-${String(shotN++).padStart(2, '0')}-${st.area}-${Math.round(st.speed)}ms-${st.alt}m`; await p.screenshot({ path: `${SHOTS}/${name}.png` }); shots.push(name + '.png'); }
    if (done) break;
  }
  if (inspect) { const st = await p.evaluate(() => window.__h.state()); await p.waitForTimeout(2500); await p.screenshot({ path: `${SHOTS}/flight-arrival-${st.area}.png` }); shots.push(`flight-arrival-${st.area}.png`); }
  const F = await p.evaluate(() => { window.__flight.stop(); const f = window.__flight; return { samples: f.samples, pop: f.pop, voids: f.voids, events: f.events, done: f.done, route: f.route, voidTests: f.voidTests ?? 0 }; });
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0, s = F.samples.filter((x) => x.frames > 5);
  const memMax = (k) => Math.max(...F.samples.filter((x) => x.mem).map((x) => x.mem[k]));
  const summary = { done: F.done, seconds: F.samples.length, shots,
    fpsMedian: med(s.map((x) => x.fpsMedian)), fpsMinWindowMedian: Math.min(...s.map((x) => x.fpsMedian)), fpsMinFrame: Math.min(...s.map((x) => x.fpsMin)), worstFrameMs: Math.max(...s.map((x) => x.worstMs)), framesOver33: s.reduce((a, x) => a + x.over33, 0), frames: s.reduce((a, x) => a + x.frames, 0),
    windowsBelow50: s.filter((x) => x.fpsMedian < 50).length, callsMax: Math.max(...s.map((x) => x.callsMax)), callsMedian: med(s.map((x) => x.callsMax)), trianglesMax: 0, speedMax: Math.max(...s.map((x) => x.speed)), tilesMax: Math.max(...s.map((x) => x.tiles.split(',').length)),
    mem: { gpuMBmax: memMax('gpuMB'), geoMBmax: memMax('geoMB'), instMBmax: memMax('instMB'), texMBmax: memMax('texMB'), hostArraysMBmax: memMax('hostArraysMB'), heapMBmax: F.samples.some((x) => x.mem?.heapMB != null) ? memMax('heapMB') : null },
    popInEvents: F.pop.length, popIn: F.pop.slice(0, 12), voidTests: F.voidTests, voidEvents: F.voids.length, voids: F.voids.slice(0, 12), legs: F.events, consoleErrors: errors.length };
  results[kind] = { summary, samples: F.samples.map(({ mem, ...x }) => ({ ...x, gpuMB: mem?.gpuMB })) };
  console.log(kind, JSON.stringify(summary));
  errorsAll.push(...errors.map((e) => `[${kind}] ${e}`)); await b.close();
}

if (ONLY === 'all' || ONLY === 'static') await staticPhase();
if (ONLY === 'all' || ONLY === 'perf') await flightPhase('perf');
if (ONLY === 'all' || ONLY === 'inspect') {
  await flightPhase('inspect');
  try { results.shotStats = JSON.parse(execFileSync('python3', ['tools/perf/shot-stats.py', SHOTS], { encoding: 'utf8' })); } catch (e) { results.shotStats = { error: String(e).slice(0, 200) }; }
}
results.consoleErrors = errorsAll;
const file = `${OUT}/world-check${ONLY === 'all' ? '' : '-' + ONLY}.json`;
fs.writeFileSync(file, JSON.stringify(results, null, 1));
console.log('console errors', errorsAll.length, errorsAll.slice(0, 6)); console.log('wrote', file);
