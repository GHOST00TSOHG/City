// Quick still of an area in real WebKit. node tools/perf/shot.mjs <area> <out.jpg> [viewIndex] [port]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [area = 'newark', out = '/tmp/shot.jpg', view = '0', port = '5199'] = process.argv.slice(2);
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${port}/?area=${area}&join=0`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.evaluate(([a, v]) => { const w = window.__registry.worldViews(a)[v]; const c = window.__cityCam; c.position.set(...w.pos); c.lookAt(...w.look); window.__cityControls.syncAngles(); }, [area, +view]);
await p.waitForTimeout(4000);
await p.screenshot({ path: out, type: 'jpeg', quality: 80 });
console.log('errors', errs.length, errs.slice(0, 2));
await b.close();
