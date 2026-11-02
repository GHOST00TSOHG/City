import { test, expect } from '@playwright/test';

// Clear -> Rain eases in (no pop), wets the ground, stays within the draw-call budget, and logs no console errors.
test('rain eases in clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/?gl=1&join=0');
  await page.waitForFunction(() => (window as any).__city?.ready, null, { timeout: Number(process.env.READY_MS ?? 60_000) });
  await page.evaluate(() => (window as any).__setWeather('rain', 0.8));
  await page.waitForTimeout(400);
  const early = await page.evaluate(() => (window as any).__weather());
  await page.waitForFunction(() => (window as any).__weather().rain > 0.7, null, { timeout: Number(process.env.READY_MS ?? 60_000) });
  const late = await page.evaluate(() => (window as any).__weather());
  expect(early.rain).toBeLessThan(0.8);   // eased, not snapped
  expect(late.wet).toBeGreaterThan(0.05);  // ground is soaking
  expect((await page.evaluate(() => (window as any).__city)).calls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});
