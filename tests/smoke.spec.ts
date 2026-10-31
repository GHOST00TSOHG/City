import { test, expect } from '@playwright/test';
import cameras from './cameras.json' with { type: 'json' };

const shots = process.env.SHOTS_DIR ?? 'test-results/shots';
const tag = process.env.SHOT_TAG ?? 'nokey';

for (const vp of [{ name: 'laptop', width: 1280, height: 800 }]) {
  test(`loads clean (${vp.name})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(vp);
    await page.goto('/?stats');
    await expect(page.locator('#city')).toBeVisible();
    await page.waitForFunction(() => (window as any).__city, null, { timeout: 30_000 });
    await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 4000));
    for (const cam of cameras) await page.screenshot({ path: `${shots}/${tag}-${vp.name}-${cam.id}.png` });
    const info = await page.evaluate(() => (window as any).__city);
    console.log(`[${tag}/${vp.name}]`, JSON.stringify(info), 'google:', await page.locator('#google').isVisible(), await page.locator('#gcopy').textContent());
    if (info.tiles) {
      const logo = page.locator('#google img.glogo');
      await expect(logo).toBeVisible();
      expect(await logo.getAttribute('alt')).toBe('Google Maps');
      expect(await logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    expect(info.calls).toBeLessThanOrEqual(150);
    expect(errors).toEqual([]);
  });
}
