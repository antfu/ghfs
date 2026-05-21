import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'pathe'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = resolve(here, 'tests/e2e/fixtures')
const homeDir = resolve(fixtures, 'hub/_home')

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['_support/**', 'fixtures/**'],
  // Note: fixtures are built before this config is consumed via the
  // `pretest:e2e` script in the root package.json. Playwright's
  // `globalSetup` cannot be used here because it runs *after* the
  // `webServer` processes start, and the hub server reads its enabled
  // projects from disk once on boot.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `node ./dist/cli.mjs ui --port 7910 --no-open --no-portless --cwd ${JSON.stringify(resolve(fixtures, 'single'))}`,
      port: 7910,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env as Record<string, string>,
        GH_TOKEN: 'fake-for-tests',
      },
    },
    {
      command: `node ./dist/cli.mjs hub --port 7911 --no-open --cwd ${JSON.stringify(resolve(fixtures, 'hub'))}`,
      port: 7911,
      timeout: 90_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env as Record<string, string>,
        HOME: homeDir,
        GH_TOKEN: 'fake-for-tests',
      },
    },
  ],
})
