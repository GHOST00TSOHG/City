import { test, expect } from '@playwright/test';

// Walkers stand on the road surface: at the street spawn (on a road) the walkable floor is above the bare terrain
// by the road's lift, never below it. Also: clean console, draw budget.
test('walkable floor is the road top', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?gl=1&join=0&area=newark');
  await page.waitForFunction(() => (window as any).__city?.ready, null, { timeout: Number(process.env.READY_MS ?? 60_000) });
  const r = await page.evaluate(() => { const g = (window as any).__ground; const s = g(0, 0).spawn; return { s, f: g(s.x, s.z).floor }; });
  expect(r.f.y).toBeGreaterThanOrEqual(r.s.ground - 0.001);
  expect((await page.evaluate(() => (window as any).__city)).calls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});
