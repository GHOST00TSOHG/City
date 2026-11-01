// Headless flight-route benchmark: flies a fixed route with real key input (low-fast + burst, climb, sharp turns,
// dive, long straight) and reports rAF frame-time p50/p95/p99, long frames (>33 ms, >20 ms), worst, draw calls and
// console errors. Headless = WebGL2/SwiftShader on CPU, so absolute ms are far slower than an M4; compare runs, not
// absolutes. Usage: node tools/perf/flight-route.mjs <dist> [area] [label] [query]   e.g. query "a6=0" for legacy.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const [dist = 'dist', area = 'keywest', label = dist, extra = ''] = process.argv.slice(2);
const types = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(dist, p.endsWith('/') ? p + 'index.html' : p);
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 480), height: Number(process.env.H ?? 270) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/?gl=1&join=0&area=${area}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__city?.ready && window.__robot, null, { timeout: 180000 });
await page.waitForTimeout(5000);
const res = await page.evaluate(async (SEC) => {
  const R = window.__robot, c = R.ctl; R.setMode?.(true); R.dropIn(40);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1500); c.press('KeyF', true); c.press('KeyF', false);
  const ft = [], calls = []; let last = 0, on = true;
  const tick = (t) => { if (last) ft.push(t - last); last = t; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const iv = setInterval(() => { const k = window.__city?.calls; if (k != null) calls.push(k); }, 1000);
  const route = [['KeyW', 'ShiftLeft'], ['KeyW', 'Space'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyC'], ['KeyW', 'ShiftLeft']];
  const seg = (SEC * 1000) / route.length;
  for (const keys of route) { keys.forEach((k) => c.press(k, true)); await wait(seg); keys.forEach((k) => c.press(k, false)); }
  on = false; clearInterval(iv);
  const s = [...ft].sort((a, b) => a - b), n = s.length, q = (p) => +s[Math.min(n - 1, Math.floor(n * p))].toFixed(2);
  return { frames: n, avgMs: +(ft.reduce((a, b) => a + b, 0) / n).toFixed(2), p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: +s[n - 1].toFixed(1),
    over33: ft.filter((v) => v > 33.4).length, over20: ft.filter((v) => v > 20).length, over2xMedian: ft.filter((v) => v > 2 * s[n >> 1]).length,
    drawCallsMax: Math.max(...calls), drawCallsAvg: Math.round(calls.reduce((a, b) => a + b, 0) / (calls.length || 1)), pos: window.__city?.robot?.pos };
}, Number(process.env.SEC ?? 30));
console.log(JSON.stringify({ label, area, extra, ...res, consoleErrors: errors.length, errors: errors.slice(0, 3) }));
await browser.close(); srv.close();
