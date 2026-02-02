import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Setup project - авторизация admin
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      testIgnore: '**/viewer-auth.setup.ts',
    },
    // Setup project - авторизация viewer
    {
      name: 'viewer-setup',
      testMatch: '**/viewer-auth.setup.ts',
    },
    // Основные тесты - зависят от setup (admin)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /rbac\.spec\.ts/,
    },
    // RBAC тесты - зависят от viewer-setup
    {
      name: 'rbac',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/viewer.json',
      },
      dependencies: ['viewer-setup'],
      testMatch: /rbac\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
