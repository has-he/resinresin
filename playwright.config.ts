import { defineConfig } from '@playwright/test';

const externalServer = process.env.RESIN_TEST_URL;

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: externalServer || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: externalServer ? undefined : { command: 'npm run dev -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
