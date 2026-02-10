import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000, // 60s — BPMN сценарии могут polling до 30s на один шаг
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Setup projects — авторизация разных ролей через dev login
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      testIgnore: ['**/viewer-auth.setup.ts', '**/editor-auth.setup.ts'],
    },
    {
      name: 'viewer-setup',
      testMatch: '**/viewer-auth.setup.ts',
    },
    {
      name: 'editor-setup',
      testMatch: '**/editor-auth.setup.ts',
    },
    // Основные тесты — с авторизацией admin
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: [/rbac\.spec\.ts/, /rbac-extended\.spec\.ts/, /auth\.spec\.ts/],
    },
    // RBAC тесты — с авторизацией viewer (Белов)
    {
      name: 'rbac',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/viewer.json',
      },
      dependencies: ['viewer-setup'],
      testMatch: /rbac\.spec\.ts/,
    },
    // RBAC extended тесты — с авторизацией editor (Орлов)
    {
      name: 'editor-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/editor.json',
      },
      dependencies: ['editor-setup', 'setup'],
      testMatch: /rbac-extended\.spec\.ts/,
    },
    // Auth тесты — без предварительной авторизации
    {
      name: 'auth-tests',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /auth\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
