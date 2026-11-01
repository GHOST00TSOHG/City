import { test, expect } from '@playwright/test';

// Palms are a Key West-only species: zero palm instances in every NJ area, some in Key West. Clean console.
for (const [area, want] of [['keywest', true], ['bayshore', false], ['sandyhook', false], ['newark', false], ['passaic', false]] as const) {
  test(`palms ${want ? 'present' : 'absent'} in ${area}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?gl=1&join=0&area=${area}`);
    await page.waitForFunction(() => (window as any).__city?.ready, null, { timeout: 90_000 });
    const palms = await page.evaluate(() => (window as any).__stats().palms);
    if (want) expect(palms).toBeGreaterThan(0); else expect(palms).toBe(0);
    expect(errors).toEqual([]);
  });
}
