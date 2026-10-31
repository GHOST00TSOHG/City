import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  use: {
    baseURL: process.env.CITY_URL ?? 'http://localhost:4173',
    browserName: 'chromium',
    headless: true,
    launchOptions: { args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: process.env.CITY_URL ? undefined : { command: 'npm run preview', port: 4173, reuseExistingServer: true },
});
