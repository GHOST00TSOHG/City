// Headless screenshots: node scripts/shots.mjs <prefix>  (expects `npm run preview` on :5173)
import { chromium } from '@playwright/test';
const prefix = process.argv[2] || 'trees';
const views = {
  street: { pos: [55, 0, 70], look: [0, 6, 0], walk: true },
  aerial: { pos: [260, 140, 260], look: [0, 0, 0], walk: false },
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:5173/?perf=1', { waitUntil: 'load' });
const results = {};
for (const [name, v] of Object.entries(views)) {
  for (const w of ['clear', 'rain']) {
    await page.evaluate(({ v, w }) => {
      const c = window.__cityCam, k = window.__cityControls;
      c.position.set(...v.pos); if (!v.walk) c.position.y = v.pos[1];
      c.lookAt(...v.look); k.syncAngles(); k.setWalk(v.walk); window.__setWeather(w);
      if (v.walk) c.position.y = 40;
    }, { v, w });
    await page.waitForTimeout(name === 'street' && w === 'clear' ? 45000 : 25000);
    const s = await page.evaluate(() => window.__city);
    results[`${name}-${w}`] = s;
    await page.screenshot({ path: `/workspace/city-shots/${prefix}-${name}-${w}.png` });
  }
}
console.log(JSON.stringify(results, null, 1));
console.log('console errors/warnings:', errors.length ? errors.join('\n') : 'none');
await browser.close();
