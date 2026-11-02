import { test, expect } from '@playwright/test';
import cameras from './cameras.json' with { type: 'json' };

const shots = process.env.SHOTS_DIR ?? 'test-results/shots';
const tag = process.env.SHOT_TAG ?? 'rebuild';

for (const vp of [{ name: 'laptop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`loads clean (${vp.name})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(vp);
    await page.goto('/?perf=1&gl=1'); // headless CI has no WebGPU adapter; gl=1 exercises the WebGL2 fallback
    await expect(page.locator('#city')).toBeVisible();
    await page.waitForFunction(() => (window as any).__city?.ready, null, { timeout: Number(process.env.READY_MS ?? 60_000) });
    await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 4000));
    for (const cam of cameras) await page.screenshot({ path: `${shots}/${tag}-${vp.name}-${cam.id}.png` });
    const info = await page.evaluate(() => (window as any).__city);
    console.log(`[${tag}/${vp.name}]`, JSON.stringify(info));
    expect(info.buildings).toBeGreaterThan(1000);
    await expect(page.locator('#credits')).toContainText('OpenStreetMap');
    expect(info.calls).toBeLessThanOrEqual(150);
    expect(errors).toEqual([]);
  });
}
