// Region breakdown (vmmap -summary) of the Playwright WebKit WebContent process after the first tile is built.
//   node tools/perf/vmmap.mjs [--area keywest] [--q "&x=1"] [--block <regex>] [--port 5199]
import os from 'node:os';
import { execSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
if (arg('block', '')) { const re = new RegExp(arg('block', '')); await p.route('**/*', (r) => (re.test(r.request().url()) ? undefined : r.continue())); }
await p.goto(`http://localhost:${arg('port', '5199')}/?join=0&area=${arg('area', 'keywest')}${arg('q', '')}`, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
if (!process.argv.includes('--hold')) await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.waitForTimeout(+arg('wait', 8) * 1000);
const ps = execSync('ps -axo pid=,rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter((l) => /WebContent/.test(l) && /pw-browsers|ms-playwright/.test(l));
for (const l of ps) {
  const f = l.trim().split(/\s+/); console.log('pid', f[0], 'rss MB', Math.round(+f[1] / 1024));
  try { console.log(execSync(`vmmap -summary ${f[0]}`, { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').slice(-60).join('\n')); } catch (e) { console.log('vmmap failed', String(e.message).slice(0, 300)); }
}
await b.close();
