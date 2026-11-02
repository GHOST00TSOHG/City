// Engine baseline: WebContent RSS over time with the app booted but area data blocked (no tile built), WebKit headless:false.
//   node tools/perf/baseline.mjs [--port 5199] [--q "&x=1"] [--wait 8] [--noblock]
import os from 'node:os';
import { execSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
let pidc = ''; const wc = () => { if (pidc) { try { return Math.round(+execSync(`ps -o rss= -p ${pidc}`, { encoding: 'utf8' }) / 1024); } catch { pidc = ''; } } for (const l of execSync('ps -axo pid=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) if (/WebContent/.test(l) && /pw-browsers|ms-playwright/.test(l)) pidc = l.trim().split(/\s+/)[0]; return pidc ? wc() : 0; };
const wcOld = () => { let t = 0; for (const l of execSync('ps -axo rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) if (/WebContent/.test(l) && /pw-browsers|ms-playwright/.test(l)) t += +l.trim().split(/\s+/)[0] / 1024; return Math.round(t); };
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const log = []; const t0 = Date.now(); const s = setInterval(() => log.push(`${((Date.now() - t0) / 1000).toFixed(1)}:${wc()}`), +arg('step', 1000));
const ready = process.argv.includes('--ready'); // wait for the first tile (engine + one tile); --block <regex> holds matching URLs forever
if (arg('abort', '')) { const re = new RegExp(arg('abort', '')); await p.route('**/*', (r) => (re.test(r.request().url()) ? r.abort() : r.continue())); }
if (arg('block', '')) { const re = new RegExp(arg('block', '')); await p.route('**/*', (r) => (re.test(r.request().url()) ? undefined : r.continue())); }
else if (!process.argv.includes('--noblock') && !ready) await p.route('**/areas/**', () => {}); // hold forever: engine boots, no tile
p.on('pageerror', () => {});
if (process.argv.includes('--logs')) p.on('console', (m) => { if (/City\]/.test(m.text())) log.push(`[${m.text().slice(0, 70)}]`); });
if (process.argv.includes('--stamp')) await p.addInitScript(() => { window.__cl = []; const o = console.info.bind(console); console.info = (...a) => { window.__cl.push([Date.now(), String(a[0]).slice(0, 80)]); o(...a); }; });
await p.goto(`http://localhost:${arg('port', '5199')}/?join=0&area=${arg('area', 'newark')}${arg('q', '')}`, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
if (ready) await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.waitForTimeout(+arg('wait', 8) * 1000);
clearInterval(s);
if (process.argv.includes('--stamp')) { const cl = await p.evaluate(() => window.__cl); for (const [t, m] of cl) log.push(`\n  @${((t - t0) / 1000).toFixed(2)} ${m}\n`); } console.log('WebContent MB by second:', log.join(' '));
const info = await p.evaluate(() => { const r = window.__renderer?.info; return { tex: r?.memory?.textures, geo: r?.memory?.geometries, dpr: devicePixelRatio, canvas: [document.querySelector('canvas')?.width, document.querySelector('canvas')?.height] }; });
console.log(JSON.stringify(info));
await b.close();
