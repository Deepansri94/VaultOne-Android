import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { outputFolder: 'reports', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npx serve -l 8765 ../..',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: true,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
