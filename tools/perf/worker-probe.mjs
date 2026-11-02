// Does a terminated worker give its memory back in WebKit? Allocates garbage (arrays + objects) in a worker or on the main thread and prints
// WebContent RSS after each round.   node tools/perf/worker-probe.mjs --mode term|keep|main [--mb 200] [--rounds 3]
import os from 'node:os';
import { execSync } from 'node:child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const wc = () => { let t = 0; for (const l of execSync('ps -axo rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) if (/WebContent/.test(l) && /pw-browsers|ms-playwright/.test(l)) t += +l.trim().split(/\s+/)[0] / 1024; return Math.round(t); };
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.setContent('<html><body>probe</body></html>');
await p.waitForTimeout(1500); console.log('blank', wc());
const mode = arg('mode', 'term'), mb = +arg('mb', 200), rounds = +arg('rounds', 3);
const work = `function work(mb) { const keep = []; for (let i = 0; i < mb; i++) { const a = new Float32Array(262144); a[0] = i; keep.push(a); } const o = []; for (let i = 0; i < mb * 20000; i++) o.push({ a: i, b: [i] }); return keep.length + o.length; }`;
await p.evaluate(({ work, mode }) => { window.__src = work; window.__mode = mode; }, { work, mode });
for (let r = 0; r < rounds; r++) {
  await p.evaluate(async ({ mb }) => {
    const src = window.__src;
    if (window.__mode === 'main') { (0, eval)(src); window.work(mb); return; }
    const w = window.__w ?? new Worker(URL.createObjectURL(new Blob([src + '\nonmessage = (e) => postMessage(work(e.data));'], { type: 'text/javascript' })));
    await new Promise((ok) => { w.onmessage = ok; w.postMessage(mb); });
    if (window.__mode === 'term') w.terminate(); else window.__w = w;
  }, { mb });
  await p.waitForTimeout(3000); console.log(mode, 'round', r, wc());
}
await b.close();
