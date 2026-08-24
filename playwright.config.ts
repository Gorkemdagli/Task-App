import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const parsedBaseURL = new URL(baseURL);
if (!['127.0.0.1', 'localhost'].includes(parsedBaseURL.hostname)) {
  throw new Error('Playwright E2E is local-only; use localhost or 127.0.0.1');
}

const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions:
      chromePath && existsSync(chromePath) ? { executablePath: chromePath } : undefined,
  },
  webServer: {
    command: 'npm run preview --workspace=frontend -- --host 127.0.0.1',
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
