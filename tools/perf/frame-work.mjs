// Headless per-frame WORK counter (not a frame-rate test: SwiftShader fps is meaningless).
// Hooks WebGL2 uploads/compiles, long tasks and JS heap growth, flies the robot through a fixed script,
// and prints totals and per-frame figures. Usage: node tools/perf/frame-work.mjs <dist dir> [area] [label]
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const [dist = 'dist', area = 'keywest', label = dist] = process.argv.slice(2);
const types = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(dist, p.endsWith('/') ? p + 'index.html' : p);
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 160, height: 100 } });
const errors = []; page.on('console', (m) => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const W = (window.__work = { on: false, frames: [], cur: { up: 0, upCalls: 0, comp: 0, js: 0 }, long: 0, longMs: 0, tally: {} });
  const T = (k, b) => { const key = k + ':' + b; W.tally[key] = (W.tally[key] || 0) + 1; if (b > 300000 && !W.stk?.[key]) { (W.stk ||= {})[key] = new Error().stack.split('\n').slice(2, 9).join(' | '); } };
  const P = WebGL2RenderingContext.prototype;
  const size = (a) => (a && a.byteLength) || 0;
  { const o = P.bufferData; P.bufferData = function (...a) { if (W.on) { const b = typeof a[1] === 'number' ? a[1] : size(a[1]); W.cur.up += b; T('bufferData', b); W.cur.upCalls++; } return o.apply(this, a); }; }
  { const o = P.bufferSubData; P.bufferSubData = function (...a) { if (W.on) { const d = a[2], bpe = d?.BYTES_PER_ELEMENT ?? 1; const b = a[4] ? a[4] * bpe : size(d) - (a[3] ?? 0) * bpe; W.cur.up += b; T('bufferSubData', b); W.cur.upCalls++; } return o.apply(this, a); }; }
  for (const k of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D']) { const o = P[k]; P[k] = function (...a) { if (W.on) { let b = 0; for (const x of a) b = Math.max(b, size(x)); if (!b) for (const x of a) if (x && x.width) b = x.width * x.height * 4; W.cur.up += b; T(k, b); W.cur.upCalls++; } return o.apply(this, a); }; }
  for (const k of ['compileShader', 'linkProgram']) { const o = P[k]; P[k] = function (...a) { if (W.on && k === 'linkProgram') W.cur.comp++; return o.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); const h0 = performance.memory?.usedJSHeapSize ?? 0; W.step?.(); cb(t); const js = performance.now() - s; if (W.on) { const h1 = performance.memory?.usedJSHeapSize ?? 0; W.frames.push({ ...W.cur, js, heap: Math.max(0, h1 - h0) }); W.cur = { up: 0, upCalls: 0, comp: 0, js: 0 }; } });
  new PerformanceObserver((l) => { if (!W.on) return; for (const e of l.getEntries()) { W.long++; W.longMs = Math.max(W.longMs, e.duration); } }).observe({ entryTypes: ['longtask'] });
});
await page.goto(`http://localhost:${port}/?gl=1&join=0&area=${area}`);
await page.waitForFunction(() => window.__city?.ready && window.__robot, null, { timeout: 120000 });
await page.waitForTimeout(6000); // let idle preloads + first-sight compiles settle so we measure flight, not boot
const FR = Number(process.env.FRAMES ?? 150), STEP = Number(process.env.STEP ?? 3);
const res = await page.evaluate(async ([FR, STEP]) => {
  const R = window.__robot, c = R.ctl, W = window.__work; R.dropIn(30);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(300); c.press('KeyF', true); await wait(50); c.press('KeyF', false); c.press('KeyW', true);
  // Fixed path, fixed metres per frame: low and fast (40%), high cruise (25%), low sharp S-turns (35%).
  let i = 0, h = c.heading, x = c.pos.x, z = c.pos.z; const t0 = performance.now();
  await new Promise((done) => {
    W.on = true;
    W.step = () => {
      if (i >= FR) { W.on = false; W.step = null; done(); return; }
      const f = i / FR, alt = f < 0.4 ? 25 : f < 0.65 ? 250 : 40;
      if (f >= 0.65) h += Math.sin(i * 0.12) * 0.09;
      x += Math.sin(h) * STEP; z += Math.cos(h) * STEP;
      const g = window.__robot.ctl.floor.y; c.pos.set(x, Math.max(g, 0) + alt, z); c.vel.set(Math.sin(h) * STEP * 60, 0, Math.cos(h) * STEP * 60); i++;
    };
  });
  c.press('KeyW', false);
  const F = W.frames, n = F.length, sum = (k) => F.reduce((a, f) => a + f[k], 0), max = (k) => F.reduce((a, f) => Math.max(a, f[k]), 0);
  const js = F.map((f) => f.js).sort((a, b) => a - b);
  const topUploads = Object.entries(W.tally).map(([k, c]) => [k, c, c * +k.split(':')[1]]).sort((a, b) => b[2] - a[2]).slice(0, 8);
  const owners = {}; const want = new Set(Object.keys(W.stk || {}).map(k => +k.split(':')[1])); window.__scene?.traverse?.((o) => { const g = o.geometry; if (!g) return; const at = { ...g.attributes }; if (o.instanceMatrix) at.instanceMatrix = o.instanceMatrix; if (o.instanceColor) at.instanceColor = o.instanceColor; for (const k in at) { const b = at[k]?.array?.byteLength; if (want.has(b)) owners[b] = (owners[b] || '') + o.name + '/' + o.type + '.' + k + '; '; } });
  return { owners, stacks: W.stk, topUploads, frames: n, metres: n * STEP, wallSeconds: +((performance.now() - t0) / 1000).toFixed(1),
    uploadMB: +(sum('up') / 1e6).toFixed(2), uploadKBPerFrame: +(sum('up') / 1e3 / n).toFixed(1), maxUploadKBFrame: +(max('up') / 1e3).toFixed(0), framesUploadOver256KB: F.filter((f) => f.up > 256e3).length,
    uploadCallsPerFrame: +(sum('upCalls') / n).toFixed(1), programLinks: sum('comp'), framesWithCompile: F.filter((f) => f.comp).length,
    jsMsMedian: +js[n >> 1].toFixed(2), jsMsP99: +js[Math.floor(n * 0.99)].toFixed(2), jsMsMax: +js[n - 1].toFixed(1), framesJsOver8ms: F.filter((f) => f.js > 8).length,
    heapGrowthKBPerFrame: +(sum('heap') / 1e3 / n).toFixed(1), longTasks: W.long, longestTaskMs: Math.round(W.longMs) };
}, [FR, STEP]);
console.log(JSON.stringify({ label, area, ...res, consoleErrors: errors.length, errors: errors.slice(0, 3) }));
await browser.close(); srv.close();
