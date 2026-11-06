import { test, expect } from '@playwright/test';

// Full-footprint road-clearance gate: every lamp (r 0.25), tree (r 0.4), street prop, pack building and custom-town object must keep its WHOLE base
// (4 oriented corners + 4 edge midpoints) clear of every asphalt edge and junction disc. Companion to tests/placement.spec.ts.
// Run against the preview server: CITY_URL=http://localhost:4191 READY_MS=200000 npx playwright test tests/road-clearance.spec.ts
const READY = Number(process.env.READY_MS ?? 120_000);
const AREAS = ['newark', 'passaic', 'bayshore', 'sandyhook', 'keywest'];
const TOWNS = ['edo', 'cyber', 'paris', 'harbor', 'airfield', 'outpost'];

async function open(page: import('@playwright/test').Page, q: string) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?gl=1&join=0&mp=0&mode=free&${q}`);
  await page.waitForFunction(() => (window as any).__city?.ready, null, { timeout: READY });
  return errors;
}

for (const area of AREAS) {
  test(`road clearance: area ${area}`, async ({ page }) => {
    test.setTimeout(READY + 60_000);
    const errors = await open(page, `area=${area}`);
    const audit = await page.evaluate(() => (window as any).__auditPlacements());
    expect(audit.area).toBe(area);
    expect(audit.counts.lamps).toBeGreaterThan(0);
    expect(audit.counts.cityObjects).toBeGreaterThan(0);
    expect(audit.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const town of TOWNS) {
  test(`road clearance: town ${town}`, async ({ page }) => {
    test.setTimeout(READY + 60_000);
    const errors = await open(page, `town=${town}`);
    const r = await page.evaluate((t) => ({ town: (window as any).__auditPlacements(t), city: (window as any).__auditPlacements() }), town);
    expect(r.town.counts.townObjects).toBeGreaterThan(0);
    expect(r.town.counts.townBuildings).toBeGreaterThan(0);
    expect(r.town.violations).toEqual([]);
    expect(r.city.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
