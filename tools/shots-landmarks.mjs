// Landmark before/after shots: node tools/shots-landmarks.mjs <tag> [before|after]
// Expects `npm run preview` on :4173 (production build). Uses WebKit when available.
import { webkit, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

const tag = process.argv[2] || 'landmarks';
const phase = process.argv[3] || 'after';
const outDir = `/opt/cursor/artifacts/screenshots/landmarks-${phase}`;
mkdirSync(outDir, { recursive: true });

const areas = JSON.parse(readFileSync('tools/bake/areas.json', 'utf8'));
const R = 6378137;
const k = (Math.PI / 180) * R;

function enu(areaId, lat, lon) {
  const o = areas[areaId].origin;
  const c = Math.cos((o.lat * Math.PI) / 180);
  return [(lon - o.lon) * k * c, -(lat - o.lat) * k];
}

const shots = [
  {
    id: 'newark-stadium-origin',
    area: 'newark',
    note: 'Newark Schools Stadium area origin (Bloomfield Ave); stadium landmark slot',
    pos: [120, 45, 180],
    look: [0, 8, 0],
  },
  {
    id: 'newark-cathedral',
    area: 'newark',
    note: 'Cathedral Basilica landmark (loaded)',
    ...(() => {
      const m = JSON.parse(readFileSync('public/landmarks/newark/cathedral-basilica-sacred-heart/manifest.json', 'utf8'));
      const [x, z] = enu('newark', m.lat, m.lon);
      return { pos: [x - 85, 38, z + 110], look: [x, 18, z] };
    })(),
  },
  {
    id: 'newark-stadium-street',
    area: 'newark',
    note: 'Street-level near stadium origin',
    pos: [35, 2.2, 25],
    look: [180, 2.5, 0],
  },
];

const launch = async () => {
  try {
    return { browser: await webkit.launch(), engine: 'webkit' };
  } catch {
    console.warn('WebKit unavailable, falling back to Chromium');
    return {
      browser: await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }),
      engine: 'chromium',
    };
  }
};

const { browser, engine } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

for (const s of shots) {
  await page.goto(`http://127.0.0.1:4173/?gl=1&join=0&area=${s.area}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__city?.ready, null, { timeout: 180000 });
  await page.evaluate(({ pos, look }) => {
    const cam = window.__cityCam;
    cam.position.set(...pos);
    cam.lookAt(...look);
    window.__cityControls?.syncAngles?.();
  }, s);
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 8000));
  const path = `${outDir}/${tag}-${s.id}-${phase}.png`;
  await page.screenshot({ path, timeout: 120000 });
  console.log('wrote', path, '-', s.note);
}

console.log(JSON.stringify({ engine, phase, errors }, null, 2));
await browser.close();
