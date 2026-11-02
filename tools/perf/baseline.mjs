// Engine baseline: WebContent RSS over time with the app booted but area data blocked (no tile built), WebKit headless:false.
//   node tools/perf/baseline.mjs [--port 5199] [--q "&x=1"] [--wait 8] [--noblock]
import os from 'node:os';
import { execSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const wc = () => { let t = 0; for (const l of execSync('ps -axo rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) if (/WebContent/.test(l) && /pw-browsers|ms-playwright/.test(l)) t += +l.trim().split(/\s+/)[0] / 1024; return Math.round(t); };
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const log = []; const t0 = Date.now(); const s = setInterval(() => log.push(`${Math.round((Date.now() - t0) / 1000)}:${wc()}`), 1000);
if (!process.argv.includes('--noblock')) await p.route('**/areas/**', () => {}); // hold forever: engine boots, no tile
p.on('pageerror', () => {});
await p.goto(`http://localhost:${arg('port', '5199')}/?join=0${arg('q', '')}`, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
await p.waitForTimeout(+arg('wait', 8) * 1000);
clearInterval(s); console.log('WebContent MB by second:', log.join(' '));
const info = await p.evaluate(() => { const r = window.__renderer?.info; return { tex: r?.memory?.textures, geo: r?.memory?.geometries, dpr: devicePixelRatio, canvas: [document.querySelector('canvas')?.width, document.querySelector('canvas')?.height] }; });
console.log(JSON.stringify(info));
await b.close();
