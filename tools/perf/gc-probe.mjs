// Does RSS drop when the JS heap is pressured (dead typed arrays not yet collected)? Prints WebContent RSS before/after churn.
//   node tools/perf/gc-probe.mjs [--area keywest] [--q "&x=1"] [--port 5199]
import os from 'node:os';
import { execSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const wc = () => { let t = 0; for (const l of execSync('ps -axo rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) if (/WebContent/.test(l) && /pw-browsers|ms-playwright/.test(l)) t += +l.trim().split(/\s+/)[0] / 1024; return Math.round(t); };
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`http://localhost:${arg('port', '5199')}/?join=0&area=${arg('area', 'keywest')}${arg('q', '')}`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.waitForTimeout(4000); console.log('ready', wc());
for (let i = 0; i < 4; i++) {
  await p.evaluate(() => { for (let k = 0; k < 8; k++) { const a = new Float32Array(8 << 20); a[0] = k; } return new Promise((r) => setTimeout(r, 300)); });
  await p.waitForTimeout(1500); console.log('after churn', i, wc());
}
await b.close();
