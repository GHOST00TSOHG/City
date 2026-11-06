import { test, expect } from '@playwright/test';

// Spatial common-sense gate: nothing on a street, junction, footprint or plaza; benches face their focus; every town has buildings and no overlaps.
// Run against the preview server: CITY_URL=http://localhost:4191 READY_MS=200000 npx playwright test tests/placement.spec.ts
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
  test(`placement: area ${area}`, async ({ page }) => {
    test.setTimeout(READY + 60_000);
    const errors = await open(page, `area=${area}`);
    const audit = await page.evaluate(() => (window as any).__auditPlacements());
    expect(audit.area).toBe(area);
    expect(audit.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const town of TOWNS) {
  test(`placement: town ${town}`, async ({ page }) => {
    test.setTimeout(READY + 60_000);
    const errors = await open(page, `town=${town}`);
    const info = await page.evaluate((t) => ({ built: (window as any).__towns.find((q: any) => q.id === t)?.x !== null, city: (window as any).__auditPlacements(), town: (window as any).__auditPlacements(t) }), town);
    expect(info.built).toBe(true);
    expect(info.town.counts.townBuildings).toBeGreaterThan(0);
    expect(info.town.violations).toEqual([]);
    expect(info.city.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
